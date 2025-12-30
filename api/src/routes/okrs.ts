import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenantContext";
import { listOkrsByTenant, createOkr } from "../repos/okrRepo";

const router = Router();

router.use(requireAuth, requireTenant);

router.get("/", async (req, res) => {
  const okrs = await listOkrsByTenant(req.tenantId!);
  res.json(okrs);
});

router.post("/", async (req, res) => {
  const okr = await createOkr(req.tenantId!, req.body);
  res.status(201).json(okr);
});

export default router;
