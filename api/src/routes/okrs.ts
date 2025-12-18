import { Router } from "express";
import { createOkr, listOkrs } from "../repos/okrRepo";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const rows = await listOkrs();
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { objective, fromDate, toDate } = req.body ?? {};

    if (!objective || !fromDate || !toDate) {
      return res.status(400).json({ error: "objective, fromDate, toDate son obligatorios" });
    }

    const created = await createOkr({ objective, fromDate, toDate });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

export default router;
