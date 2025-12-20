import { Router } from "express";
import { createKr, listKrsByOkr } from "../repos/krRepo";
import { getDefaultTenantId } from "../repos/tenantRepo";
import { createCheckin, listCheckinsByKr } from "../repos/checkinRepo";
import { updateKrCurrentValue } from "../repos/krRepo";

const router = Router();

// GET /krs/:okrId  -> lista KRs del OKR
router.get("/:okrId", async (req, res, next) => {
  try {
    const rows = await listKrsByOkr(req.params.okrId);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /krs  -> crea KR
router.post("/", async (req, res, next) => {
  try {
    const { okrId, title, metricName, targetValue, unit } = req.body ?? {};

    if (!okrId || !title) {
      return res.status(400).json({ error: "okrId y title son obligatorios" });
    }

    const created = await createKr({
      okrId,
      title,
      metricName,
      targetValue,
      unit,
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});



// GET /krs/:krId/checkins
router.get("/:krId/checkins", async (req, res, next) => {
  const krId = req.params.krId;
  if (!krId || krId.trim().length < 10) {
    return res.status(400).json({ error: "krId inválido" });
  }
  try {
    const rows = await listCheckinsByKr(req.params.krId);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /krs/:krId/checkins
router.post("/:krId/checkins", async (req, res, next) => {
  const krId = req.params.krId;
  if (!krId || krId.trim().length < 10) {
    return res.status(400).json({ error: "krId inválido" });
  }
  try {
    const { value, comment } = req.body ?? {};

    if (value === undefined || value === null || Number.isNaN(Number(value))) {
      return res.status(400).json({ error: "value (numérico) es obligatorio" });
    }

    const tenantId = await getDefaultTenantId();

    const created = await createCheckin({
      tenantId,
      krId: req.params.krId,
      value: Number(value),
      comment: comment ?? null,
      createdByUserId: null,
    });

    // Actualizamos current_value del KR al último check-in
    await updateKrCurrentValue(req.params.krId, Number(value));

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

export default router;
