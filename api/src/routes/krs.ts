import { Router } from "express";
import {
  createKr,
  deleteKrCascade,
  getKrById,
  getKrDeleteInfo,
  listKrsByOkr,
  updateKrCurrentValue,
} from "../repos/krRepo";
import { createCheckin, listCheckinsByKr } from "../repos/checkinRepo";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenantContext";
import { okrExists } from "../repos/okrRepo";
import { getKrInsightsByKrId } from "../repos/insightsRepo";
import { recomputeKrAndOkrInsights } from "../services/insights";
import { computeProgressPct } from "../domain/krHealth";
import { aiValidateKr, ruleValidateKr } from "../services/aiOkr";

const router = Router();

router.use(requireAuth, requireTenant);

// GET /krs/:okrId -> lista KRs del OKR
router.get("/:okrId", async (req, res, next) => {
  try {
    const rows = await listKrsByOkr(req.tenantId!, req.params.okrId);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /krs -> crea KR
router.post("/", async (req, res, next) => {
  try {
    const { okrId, title, metricName, targetValue, unit, allowHigh } = req.body ?? {};

    if (!okrId || !title) {
      return res.status(400).json({ error: "okrId y title son obligatorios" });
    }
    if (targetValue === null || targetValue === undefined || Number.isNaN(Number(targetValue))) {
      return res.status(400).json({ error: "targetValue es obligatorio" });
    }

    const okrOk = await okrExists(req.tenantId!, String(okrId));
    if (!okrOk) {
      return res.status(404).json({ error: "okr_not_found" });
    }

    const aiRequired = (process.env.INSIGHTS_AI_ENABLED || "").toLowerCase() === "true";
    let validation = await aiValidateKr({ title, metricName, unit, targetValue: Number(targetValue) });
    if (!validation) {
      if (aiRequired) {
        return res.status(502).json({ error: "ai_unavailable" });
      }
      validation = ruleValidateKr({ title, targetValue: Number(targetValue) });
    }
    const hasHigh = validation.issues?.some((i) => i.severity === "high");
    console.log("[krs] create validation", {
      hasHigh,
      allowHigh: !!allowHigh,
    });
    if (hasHigh && !allowHigh) {
      return res.status(400).json({ error: "ai_validation_failed", issues: validation.issues });
    }

    const created = await createKr({
      okrId: String(okrId),
      title,
      metricName,
      targetValue: Number(targetValue),
      unit,
    });

    await recomputeKrAndOkrInsights(req.tenantId!, created.id);

    res.status(201).json({ ...created, validation });
  } catch (err) {
    next(err);
  }
});

// GET /krs/:krId/checkins
router.get("/:krId/checkins", async (req, res, next) => {
  const krId = req.params.krId;
  if (!krId || krId.trim().length < 10) {
    return res.status(400).json({ error: "krId invalido" });
  }
  try {
    const rows = await listCheckinsByKr(req.tenantId!, req.params.krId);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /krs/:krId/checkins
router.post("/:krId/checkins", async (req, res, next) => {
  const krId = req.params.krId;
  if (!krId || krId.trim().length < 10) {
    return res.status(400).json({ error: "krId invalido" });
  }
  try {
    const { value, comment } = req.body ?? {};

    if (value === undefined || value === null || Number.isNaN(Number(value))) {
      return res.status(400).json({ error: "value (numerico) es obligatorio" });
    }

    const kr = await getKrById(req.tenantId!, req.params.krId);
    if (!kr) {
      return res.status(404).json({ error: "kr_not_found" });
    }
    if (kr.targetValue !== null && kr.targetValue !== undefined) {
      const progress = computeProgressPct(kr.currentValue, kr.targetValue);
      if (progress !== null && progress >= 100) {
        return res.status(409).json({ error: "kr_already_completed" });
      }
    }

    const created = await createCheckin({
      tenantId: req.tenantId!,
      krId: req.params.krId,
      value: Number(value),
      comment: comment ?? null,
      createdByUserId: null,
    });

    // Actualizamos current_value del KR al ultimo check-in
    await updateKrCurrentValue(req.tenantId!, req.params.krId, Number(value));

    await recomputeKrAndOkrInsights(req.tenantId!, req.params.krId);

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// GET /krs/:krId/insights
router.get("/:krId/insights", async (req, res, next) => {
  try {
    const insight = await getKrInsightsByKrId(req.tenantId!, req.params.krId);
    if (!insight) {
      return res.status(404).json({ error: "kr_insights_not_found" });
    }
    res.json(insight);
  } catch (err) {
    next(err);
  }
});

// GET /krs/:krId/delete-info
router.get("/:krId/delete-info", async (req, res, next) => {
  try {
    const info = await getKrDeleteInfo(req.tenantId!, req.params.krId);
    if (!info) {
      return res.status(404).json({ error: "kr_not_found" });
    }
    res.set("Cache-Control", "no-store");
    res.json(info);
  } catch (err) {
    next(err);
  }
});

// DELETE /krs/:krId
router.delete("/:krId", async (req, res, next) => {
  try {
    const kr = await getKrById(req.tenantId!, req.params.krId);
    if (!kr) {
      return res.status(404).json({ error: "kr_not_found" });
    }
    const info = await getKrDeleteInfo(req.tenantId!, req.params.krId);
    console.log("[krs] delete", {
      krId: req.params.krId,
      tenantId: req.tenantId,
      checkinsCount: info?.checkinsCount ?? 0,
    });
    await deleteKrCascade(req.tenantId!, req.params.krId);
    await recomputeKrAndOkrInsights(req.tenantId!, kr.okrId);
    res.json({ ok: true, deleted: info ?? { krId: kr.id, checkinsCount: 0 } });
  } catch (err) {
    next(err);
  }
});

export default router;
