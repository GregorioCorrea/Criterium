import { Router } from "express";
import { createKr, listKrsByOkr } from "../repos/krRepo";

const router = Router();

router.get("/:okrId", async (req, res, next) => {
  try {
    const rows = await listKrsByOkr(req.params.okrId);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { okrId, title, metricName, targetValue, unit } = req.body ?? {};
    if (!okrId || !title) {
      return res.status(400).json({ error: "okrId y title son obligatorios" });
    }

    const created = await createKr({ okrId, title, metricName, targetValue, unit });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

export default router;
