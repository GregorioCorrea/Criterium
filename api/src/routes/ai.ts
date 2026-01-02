import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenantContext";
import {
  aiDraftOkr,
  aiValidateKr,
  aiValidateOkr,
  ruleValidateKr,
  ruleValidateOkr,
} from "../services/aiOkr";
import { getAiClient, getAiDeployment, isAiEnabled, withRetry } from "../services/aiClient";

const router = Router();

router.use(requireAuth, requireTenant);

router.get("/status", async (_req, res) => {
  const enabled = isAiEnabled();
  const deployment = getAiDeployment();
  const client = getAiClient();
  if (!enabled || !client || !deployment) {
    return res.json({
      enabled,
      ok: false,
      source: "ai",
      checkedAt: new Date().toISOString(),
    });
  }

  try {
    await withRetry(
      () =>
        client.chat.completions.create({
          model: deployment,
          messages: [{ role: "developer", content: "ping" }],
          max_completion_tokens: 1,
          temperature: 0,
        }),
      0
    );

    return res.json({
      enabled: true,
      ok: true,
      source: "ai",
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return res.json({
      enabled: true,
      ok: false,
      source: "ai",
      checkedAt: new Date().toISOString(),
    });
  }
});

router.post("/okr/draft", async (req, res) => {
  const { objective, fromDate, toDate, context } = req.body ?? {};
  if (!objective || !fromDate || !toDate) {
    return res.status(400).json({ error: "missing_fields" });
  }

  const ai = await aiDraftOkr({ objective, fromDate, toDate, context });
  if (!ai) {
    return res.json({
      objectiveRefined: null,
      suggestedKrs: [],
      warnings: ["ai_unavailable"],
    });
  }
  res.json(ai);
});

router.post("/okr/validate", async (req, res) => {
  const { objective, fromDate, toDate, krs } = req.body ?? {};
  if (!objective || !fromDate || !toDate || !Array.isArray(krs)) {
    return res.status(400).json({ error: "missing_fields" });
  }

  const ai = await aiValidateOkr({ objective, fromDate, toDate, krs });
  if (!ai) {
    const rules = ruleValidateOkr({
      objective,
      fromDate,
      toDate,
      krs: krs.map((kr: any) => ({
        title: kr.title,
        targetValue: kr.targetValue,
      })),
    });
    return res.json({ ...rules, source: "rules" });
  }

  res.json({ ...ai, source: "ai" });
});

router.post("/kr/validate", async (req, res) => {
  const { title, metricName, unit, targetValue } = req.body ?? {};
  if (!title) {
    return res.status(400).json({ error: "missing_fields" });
  }

  const ai = await aiValidateKr({ title, metricName, unit, targetValue });
  if (!ai) {
    const rules = ruleValidateKr({ title, targetValue });
    return res.json({ ...rules, source: "rules" });
  }

  res.json({ ...ai, source: "ai" });
});

export default router;
