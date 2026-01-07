import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenantContext";
import { listOkrsWithSummary } from "../repos/okrBoardRepo";
import { getOkrDetail } from "../repos/okrDetailRepo";
import { createOkr, deleteOkrCascade, getOkrDeleteInfo } from "../repos/okrRepo";
import { getOkrInsightsByOkrId } from "../repos/insightsRepo";
import { ensureInitialOkrInsights, recomputeKrAndOkrInsights } from "../services/insights";
import { createKr } from "../repos/krRepo";
import { aiValidateOkr, ruleValidateOkr } from "../services/aiOkr";
import { computeOkrFingerprint } from "../services/validationFingerprint";

const router = Router();

router.use(requireAuth, requireTenant);

router.get("/", async (req, res) => {
  const okrs = await listOkrsWithSummary(req.tenantId!);
  res.json(okrs);
});

router.get("/:okrId/delete-info", async (req, res) => {
  const okrId = req.params.okrId;
  const info = await getOkrDeleteInfo(req.tenantId!, okrId);
  if (!info) {
    return res.status(404).json({ error: "okr_not_found" });
  }
  res.json(info);
});

router.delete("/:okrId", async (req, res, next) => {
  const okrId = req.params.okrId;
  try {
    const info = await getOkrDeleteInfo(req.tenantId!, okrId);
    if (!info) {
      return res.status(404).json({ error: "okr_not_found" });
    }
    console.log("[okrs] delete", {
      okrId,
      tenantId: req.tenantId,
      krCount: info.krCount,
      checkinsCount: info.checkinsCount,
    });
    await deleteOkrCascade(req.tenantId!, okrId);
    res.json({ ok: true, deleted: info });
  } catch (err) {
    next(err);
  }
});

router.get("/:okrId", async (req, res) => {
  const okrId = req.params.okrId;
  const detail = await getOkrDetail(req.tenantId!, okrId);
  if (!detail) {
    return res.status(404).json({ error: "okr_not_found" });
  }
  res.json(detail);
});

router.get("/:okrId/insights", async (req, res) => {
  const okrId = req.params.okrId;
  const insight = await getOkrInsightsByOkrId(req.tenantId!, okrId);
  if (!insight) {
    return res.status(404).json({ error: "okr_insights_not_found" });
  }
  res.json(insight);
});

router.post("/", async (req, res) => {
  const okr = await createOkr(req.tenantId!, req.body);
  await ensureInitialOkrInsights(req.tenantId!, okr.id);
  res.status(201).json(okr);
});

router.post("/with-krs", async (req, res) => {
  const { objective, fromDate, toDate, krs, validation, allowHigh } = req.body ?? {};
  if (!objective || !fromDate || !toDate || !Array.isArray(krs)) {
    return res.status(400).json({ error: "missing_fields" });
  }

  const fingerprint = computeOkrFingerprint({ objective, fromDate, toDate, krs });
  const aiRequired = (process.env.INSIGHTS_AI_ENABLED || "").toLowerCase() === "true";
  let appliedValidation = validation && validation.fingerprint === fingerprint ? validation : null;
  if (validation && validation.fingerprint !== fingerprint) {
    console.log("[ai] okr create validation mismatch", {
      provided: validation.fingerprint,
      expected: fingerprint,
    });
  }
  if (!appliedValidation) {
    let fresh = await aiValidateOkr({
      today: new Date().toISOString().slice(0, 10),
      objective,
      fromDate,
      toDate,
      krs,
    });
    if (!fresh) {
      if (aiRequired) {
        return res.status(502).json({ error: "ai_unavailable" });
      }
      fresh = ruleValidateOkr({
        objective,
        fromDate,
        toDate,
        krs: krs.map((kr: any) => ({ title: kr.title, targetValue: kr.targetValue })),
      });
    }
    appliedValidation = { ...fresh, fingerprint };
  }

  const hasHigh = appliedValidation.issues?.some((i: { severity?: string }) => i.severity === "high");
  console.log("[ai] okr create validation", {
    hasHigh,
    allowHigh: !!allowHigh,
  });
  if (hasHigh && !allowHigh) {
    return res.status(400).json({ error: "ai_validation_failed", issues: appliedValidation.issues });
  }

  const okr = await createOkr(req.tenantId!, { objective, fromDate, toDate });
  await ensureInitialOkrInsights(req.tenantId!, okr.id);

  const createdKrs = [];
  for (const kr of krs) {
    if (!kr.title || kr.targetValue === null || kr.targetValue === undefined) {
      return res.status(400).json({ error: "kr_target_missing" });
    }
    const created = await createKr({
      okrId: okr.id,
      title: String(kr.title),
      metricName: kr.metricName ?? null,
      targetValue: Number(kr.targetValue),
      unit: kr.unit ?? null,
    });
    createdKrs.push(created);
    await recomputeKrAndOkrInsights(req.tenantId!, created.id);
  }

  res.status(201).json({ okr, krs: createdKrs, validation: appliedValidation });
});

export default router;
