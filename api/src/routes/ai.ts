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
import { getAiClient, getAiDeployment, getAiTimeoutMs, isAiEnabled, withRetry, withTimeout } from "../services/aiClient";
import { computeOkrFingerprint } from "../services/validationFingerprint";

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
    await withTimeout(
      () =>
        withRetry(
          () =>
            client.chat.completions.create({
              model: deployment,
              messages: [{ role: "developer", content: "Responde solo: OK" }],
              max_completion_tokens: 16,
            }),
          0
        ),
      getAiTimeoutMs()
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
    return res
      .status(400)
      .json({ error: "missing_fields", code: "missing_fields", message: "Faltan campos obligatorios." });
  }

  console.log("[ai] draft okr request", {
    objectiveLen: String(objective).length,
    contextLen: context ? String(context).length : 0,
    existingKrCount: Array.isArray(existingKrTitles) ? existingKrTitles.length : 0,
    answersCount: Array.isArray(answers) ? answers.filter((a) => String(a || "").trim()).length : 0,
  });

  const today = new Date().toISOString().slice(0, 10);

  const ai = await aiDraftOkr({
    today,
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
  console.log("[ai] draft okr response", {
    questions: ai.questions?.length ?? 0,
    krs: ai.suggestedKrs?.length ?? 0,
    warnings: ai.warnings ?? [],
  });
  res.json(ai);
});

router.post("/okr/validate", async (req, res) => {
  const { objective, fromDate, toDate, krs, lockedObjective, lockedDates, resolvedIssueCodes } =
    req.body ?? {};
  if (!objective || !fromDate || !toDate || !Array.isArray(krs)) {
    return res
      .status(400)
      .json({ error: "missing_fields", code: "missing_fields", message: "Faltan campos obligatorios." });
  }

  const today = new Date().toISOString().slice(0, 10);
  const fingerprint = computeOkrFingerprint({ objective, fromDate, toDate, krs });
  console.log("[ai] okr validate", {
    fingerprint,
    krs: krs.length,
    lockedObjective: !!lockedObjective,
    lockedDates: !!lockedDates,
    resolvedCount: Array.isArray(resolvedIssueCodes) ? resolvedIssueCodes.length : 0,
  });

  const ai = await aiValidateOkr({
    today,
    objective,
    fromDate,
    toDate,
    krs,
    lockedObjective: !!lockedObjective,
    lockedDates: !!lockedDates,
    resolvedIssueCodes: Array.isArray(resolvedIssueCodes) ? resolvedIssueCodes : [],
  });
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
    return res.json({ ...rules, source: "rules", fingerprint });
  }

  res.json({ ...ai, source: "ai", fingerprint });
});

router.post("/okr/fix", async (req, res) => {
  const { objective, fromDate, toDate, krs, issues } = req.body ?? {};
  if (!objective || !fromDate || !toDate || !Array.isArray(krs) || !Array.isArray(issues)) {
    return res
      .status(400)
      .json({ error: "missing_fields", code: "missing_fields", message: "Faltan campos obligatorios." });
  }

  const today = new Date().toISOString().slice(0, 10);

  const ai = await aiFixOkr({ today, objective, fromDate, toDate, krs, issues });
  if (!ai) {
    return res
      .status(502)
      .json({ error: "ai_unavailable", code: "ai_unavailable", message: "IA no disponible." });
  }
  res.json(ai);
});

router.post("/kr/validate", async (req, res) => {
  const { title, metricName, unit, targetValue } = req.body ?? {};
  if (!title) {
    return res
      .status(400)
      .json({ error: "missing_fields", code: "missing_fields", message: "Faltan campos obligatorios." });
  }

  const ai = await aiValidateKr({ title, metricName, unit, targetValue });
  if (!ai) {
    const rules = ruleValidateKr({ title, targetValue });
    return res.json({ ...rules, source: "rules" });
  }

  res.json({ ...ai, source: "ai" });
});

export default router;
