import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenantContext";
import { listOkrsWithSummary } from "../repos/okrBoardRepo";
import { getOkrDetail } from "../repos/okrDetailRepo";
import { createOkr } from "../repos/okrRepo";

const router = Router();

router.use(requireAuth, requireTenant);

router.get("/", async (req, res) => {
  const okrs = await listOkrsWithSummary(req.tenantId!);
  res.json(okrs);
});

router.get("/:okrId", async (req, res) => {
  const okrId = req.params.okrId;
  const detail = await getOkrDetail(req.tenantId!, okrId);
  if (!detail) {
    return res.status(404).json({ error: "okr_not_found" });
  }
  res.json(detail);
});

router.post("/", async (req, res) => {
  const okr = await createOkr(req.tenantId!, req.body);
  res.status(201).json(okr);
});

export default router;
