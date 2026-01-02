import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenantContext";
import {
  aiDraftOkr,
  aiFixOkr,
  aiValidateKr,
  aiValidateOkr,
  ruleValidateKr,
  ruleValidateOkr,
} from "../services/aiOkr";
import { getAiClient, getAiDeployment, isAiEnabled, withRetry } from "../services/aiClient";

const router = Router();

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
          messages: [{ role: "developer", content: "Responde solo: OK" }],
          max_completion_tokens: 16,
        }),
      0
    );

    return res.json({
      enabled: true,
      ok: true,
      source: "ai",
      checkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.warn("[ai] status check failed", {
      name: err?.name,
      message: err?.message,
      status: err?.status,
      code: err?.code,
    });
    return res.json({
      enabled: true,
      ok: false,
      source: "ai",
      checkedAt: new Date().toISOString(),
    });
  }
});

router.use(requireAuth, requireTenant);

router.post("/okr/draft", async (req, res) => {
  const { objective, fromDate, toDate, context, existingKrTitles, answers } = req.body ?? {};
  if (!objective || !fromDate || !toDate) {
    return res.status(400).json({ error: "missing_fields" });
  }

  const ai = await aiDraftOkr({
    objective,
    fromDate,
    toDate,
    context,
    existingKrTitles: Array.isArray(existingKrTitles) ? existingKrTitles : [],
    answers: Array.isArray(answers) ? answers : [],
  });
  if (!ai) {
    return res.json({
      objectiveRefined: null,
      questions: [],
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

router.post("/okr/fix", async (req, res) => {
  const { objective, fromDate, toDate, krs, issues } = req.body ?? {};
  if (!objective || !fromDate || !toDate || !Array.isArray(krs) || !Array.isArray(issues)) {
    return res.status(400).json({ error: "missing_fields" });
  }

  const ai = await aiFixOkr({ objective, fromDate, toDate, krs, issues });
  if (!ai) {
    return res.status(502).json({ error: "ai_unavailable" });
  }
  res.json(ai);
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
