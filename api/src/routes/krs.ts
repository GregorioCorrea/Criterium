import { Router } from "express";
import { createKr, getKrById, listKrsByOkr, updateKrCurrentValue } from "../repos/krRepo";
import { createCheckin, listCheckinsByKr } from "../repos/checkinRepo";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenantContext";
import { okrExists } from "../repos/okrRepo";
import { getKrInsightsByKrId } from "../repos/insightsRepo";
import { recomputeKrAndOkrInsights } from "../services/insights";
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
    const { okrId, title, metricName, targetValue, unit } = req.body ?? {};

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
    if (hasHigh) {
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

export default router;
