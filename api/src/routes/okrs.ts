import { Router } from "express";
import { createOkr, listOkrs } from "../repos/okrRepo";
import { getOkrSummary } from "../repos/okrSummaryRepo";
import { listOkrsWithSummary } from "../repos/okrBoardRepo";



const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await listOkrsWithSummary(tenantId);
    res.json(rows);
  } catch (err) { next(err); }
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

router.get("/:okrId/summary", async (req, res, next) => {
  try {
    const tenantId = req.tenantId!;
    const { okrId } = req.params;
    const summary = await getOkrSummary(tenantId, okrId);
    res.json(summary);
  } catch (err) { next(err); }
});


export default router;
