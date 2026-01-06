import { getAiClient, getAiDeployment, safeParseJson, withRetry } from "./aiClient";
import { loadAiPromptConfig, loadPrompt } from "./aiPromptLoader";

export type AiDraftOkrOutput = {
  objectiveRefined: string | null;
  questions: string[];
  suggestedKrs: Array<{
    title: string;
    metricName: string | null;
    unit: string | null;
    targetValue: number;
  }>;
  warnings?: string[];
};

export type AiIssue = {
  severity: "high" | "medium" | "low";
  code: string;
  message: string;
  fixSuggestion?: string;
};

export type AiValidateOkrOutput = {
  issues: AiIssue[];
  score?: number;
};

export type AiValidateKrOutput = {
  issues: AiIssue[];
  suggestedTargetValue?: number;
};

const promptConfig = loadAiPromptConfig();
const AI_DEPLOYMENT = getAiDeployment();

function normalizeSeverity(value: string | undefined | null): "high" | "medium" | "low" | null {
  if (!value) return null;
  const v = value.toLowerCase().trim();
  if (v === "high" || v === "medium" || v === "low") return v;
  return null;
}

function normalizeIssues(issues: any[]): AiIssue[] {
  return issues
    .map((i) => ({
      severity: normalizeSeverity(i?.severity),
      code: String(i?.code ?? "issue"),
      message: String(i?.message ?? ""),
      fixSuggestion: i?.fixSuggestion ? String(i.fixSuggestion) : undefined,
    }))
    .filter((i) => i.severity && i.message)
    .map((i) => ({
      ...i,
      severity: i.severity as "high" | "medium" | "low",
    }));
}

async function runChatJson(prompt: string, input: unknown, maxTokens: number) {
  const ai = getAiClient();
  if (!ai || !AI_DEPLOYMENT) return null;
  const result = await withRetry(
    () =>
      ai.chat.completions.create({
        model: AI_DEPLOYMENT,
        messages: [
          { role: "developer", content: prompt },
          { role: "user", content: JSON.stringify(input) },
        ],
        max_completion_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
    1
  );
  const content = result.choices[0]?.message?.content ?? "";
  if (!content) {
    console.warn("[ai] chat empty content", {
      finishReason: result.choices[0]?.finish_reason,
      usage: result.usage,
    });
  }
  return content;
}

export async function aiDraftOkr(input: {
  objective: string;
  fromDate: string;
  toDate: string;
  context?: string;
  existingKrTitles?: string[];
  answers?: string[];
}): Promise<AiDraftOkrOutput | null> {
  const prompt = loadPrompt("okr-draft.skprompt.txt");
  if (!prompt) return null;

  try {
    const content = await runChatJson(
      prompt,
      input,
      promptConfig.max_output_tokens?.okr_draft ?? 900
    );
    if (!content) return null;
    const parsed = safeParseJson<AiDraftOkrOutput>(content);
    if (!parsed || !Array.isArray(parsed.suggestedKrs)) {
      console.warn("[ai] draft okr parse failed", {
        length: content.length,
        preview: content.slice(0, 200),
      });
      return null;
    }

    const suggestedKrs = parsed.suggestedKrs
      .map((kr) => ({
        title: String(kr.title ?? "").trim(),
        metricName: kr.metricName ? String(kr.metricName) : null,
        unit: kr.unit ? String(kr.unit) : null,
        targetValue: Number(kr.targetValue),
      }))
      .filter((kr) => kr.title && Number.isFinite(kr.targetValue) && kr.targetValue > 0);

    return {
      objectiveRefined: parsed.objectiveRefined ? String(parsed.objectiveRefined) : null,
      questions: Array.isArray(parsed.questions)
        ? parsed.questions.map((q) => String(q)).slice(0, 3)
        : [],
      suggestedKrs,
      warnings: parsed.warnings?.map((w) => String(w)) ?? [],
    };
  } catch (err: any) {
    console.warn("[ai] draft okr failed", {
      message: err?.message,
    });
    return null;
  }
}

export async function aiFixOkr(input: {
  objective: string;
  fromDate: string;
  toDate: string;
  krs: Array<{ title: string; metricName?: string | null; unit?: string | null; targetValue: number }>;
  issues: AiIssue[];
}): Promise<{ correctedKrs: AiDraftOkrOutput["suggestedKrs"]; notes?: string[] } | null> {
  const prompt = loadPrompt("okr-fix.skprompt.txt");
  if (!prompt) return null;

  try {
    const content = await runChatJson(
      prompt,
      input,
      promptConfig.max_output_tokens?.okr_fix ?? 700
    );
    if (!content) return null;
    const parsed = safeParseJson<{ correctedKrs: AiDraftOkrOutput["suggestedKrs"]; notes?: string[] }>(
      content
    );
    if (!parsed || !Array.isArray(parsed.correctedKrs)) return null;
    const correctedKrs = parsed.correctedKrs
      .map((kr) => ({
        title: String(kr.title ?? "").trim(),
        metricName: kr.metricName ? String(kr.metricName) : null,
        unit: kr.unit ? String(kr.unit) : null,
        targetValue: Number(kr.targetValue),
      }))
      .filter((kr) => kr.title && Number.isFinite(kr.targetValue) && kr.targetValue > 0);
    return { correctedKrs, notes: parsed.notes?.map((n) => String(n)) ?? [] };
  } catch {
    return null;
  }
}

export async function aiValidateOkr(input: {
  objective: string;
  fromDate: string;
  toDate: string;
  krs: Array<{ title: string; metricName?: string | null; unit?: string | null; targetValue: number }>;
}): Promise<AiValidateOkrOutput | null> {
  const prompt = loadPrompt("okr-validate.skprompt.txt");
  if (!prompt) return null;

  try {
    const content = await runChatJson(
      prompt,
      input,
      promptConfig.max_output_tokens?.okr_validate ?? 700
    );
    if (!content) return null;
    const parsed = safeParseJson<AiValidateOkrOutput>(content);
    if (!parsed || !Array.isArray(parsed.issues)) return null;
    return {
      issues: normalizeIssues(parsed.issues),
      score: typeof parsed.score === "number" ? parsed.score : undefined,
    };
  } catch {
    return null;
  }
}

export async function aiValidateKr(input: {
  title: string;
  metricName?: string | null;
  unit?: string | null;
  targetValue?: number | null;
}): Promise<AiValidateKrOutput | null> {
  const prompt = loadPrompt("kr-validate.skprompt.txt");
  if (!prompt) return null;

  try {
    const content = await runChatJson(
      prompt,
      input,
      promptConfig.max_output_tokens?.kr_validate ?? 500
    );
    if (!content) return null;
    const parsed = safeParseJson<AiValidateKrOutput>(content);
    if (!parsed || !Array.isArray(parsed.issues)) return null;
    return {
      issues: normalizeIssues(parsed.issues),
      suggestedTargetValue:
        typeof parsed.suggestedTargetValue === "number" ? parsed.suggestedTargetValue : undefined,
    };
  } catch {
    return null;
  }
}

export function ruleValidateOkr(input: {
  objective: string;
  fromDate: string;
  toDate: string;
  krs: Array<{ title: string; targetValue: number | null }>;
}): AiValidateOkrOutput {
  const issues: AiIssue[] = [];
  if (!input.objective || input.objective.trim().length < 5) {
    issues.push({
      severity: "high",
      code: "objective_short",
      message: "El objetivo es muy corto o vacio.",
      fixSuggestion: "Redacta un objetivo especifico y medible.",
    });
  }

  if (!input.fromDate || !input.toDate || input.fromDate > input.toDate) {
    issues.push({
      severity: "high",
      code: "dates_invalid",
      message: "Las fechas del OKR son invalidas.",
      fixSuggestion: "Verifica que la fecha de inicio sea anterior a la de fin.",
    });
  }

  if (!input.krs.length) {
    issues.push({
      severity: "high",
      code: "krs_missing",
      message: "El OKR debe tener al menos 1 KR.",
      fixSuggestion: "Agrega KRs numericos y medibles.",
    });
  }

  for (const kr of input.krs) {
    if (!kr.title || kr.title.trim().length < 3) {
      issues.push({
        severity: "medium",
        code: "kr_title_short",
        message: "Hay un KR con titulo muy corto.",
        fixSuggestion: "Aclara el KR con una metrica concreta.",
      });
    }
    if (kr.targetValue === null || kr.targetValue === undefined || kr.targetValue <= 0) {
      issues.push({
        severity: "high",
        code: "kr_target_missing",
        message: "Todos los KRs deben tener target numerico mayor a 0.",
        fixSuggestion: "Define un target numerico coherente.",
      });
    }
  }

  return { issues };
}

export function ruleValidateKr(input: {
  title: string;
  targetValue?: number | null;
}): AiValidateKrOutput {
  const issues: AiIssue[] = [];
  if (!input.title || input.title.trim().length < 3) {
    issues.push({
      severity: "high",
      code: "kr_title_short",
      message: "El titulo del KR es demasiado corto.",
      fixSuggestion: "Redacta un KR medible y especifico.",
    });
  }
  if (input.targetValue === null || input.targetValue === undefined || input.targetValue <= 0) {
    issues.push({
      severity: "high",
      code: "kr_target_missing",
      message: "El targetValue es obligatorio y debe ser mayor a 0.",
      fixSuggestion: "Define un target numerico.",
    });
  }
  return { issues };
}
