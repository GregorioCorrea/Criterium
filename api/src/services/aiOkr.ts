import { getAiClient, getAiDeployment, safeParseJson, withRetry } from "./aiClient";

export type AiDraftOkrOutput = {
  objectiveRefined: string | null;
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

export async function aiDraftOkr(input: {
  objective: string;
  fromDate: string;
  toDate: string;
  context?: string;
}): Promise<AiDraftOkrOutput | null> {
  const ai = getAiClient();
  if (!ai) return null;

  const prompt = `
Eres un asistente de OKRs. Devuelve SOLO un JSON valido con:
{
  "objectiveRefined": string | null,
  "suggestedKrs": [
    { "title": string, "metricName": string|null, "unit": string|null, "targetValue": number }
  ],
  "warnings": string[]
}
Reglas:
- suggestedKrs debe tener 2 a 4 elementos.
- targetValue debe ser numerico y > 0.
- explanationShort debe ser <= 280 chars (si aparece).

Input:
${JSON.stringify(input)}
`;

  try {
    const result = await withRetry(
      () =>
        ai.chat.completions.create({
          model: AI_DEPLOYMENT ?? "",
          messages: [{ role: "developer", content: prompt }],
          max_completion_tokens: 700,
          temperature: 0.3,
        }),
      1
    );
    const content = result.choices[0]?.message?.content ?? "";
    const parsed = safeParseJson<AiDraftOkrOutput>(content);
    if (!parsed || !Array.isArray(parsed.suggestedKrs)) return null;

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
      suggestedKrs,
      warnings: parsed.warnings?.map((w) => String(w)) ?? [],
    };
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
  const ai = getAiClient();
  if (!ai) return null;

  const prompt = `
Eres un validador de OKRs. Devuelve SOLO un JSON valido con:
{
  "issues": [
    { "severity": "high|medium|low", "code": string, "message": string, "fixSuggestion": string }
  ],
  "score": number
}
Detecta: objetivos vagos, fechas incoherentes, KRs no medibles, target faltante, demasiados KRs.
Si no hay issues, devuelve issues: [].

Input:
${JSON.stringify(input)}
`;

  try {
    const result = await withRetry(
      () =>
        ai.chat.completions.create({
          model: AI_DEPLOYMENT ?? "",
          messages: [{ role: "developer", content: prompt }],
          max_completion_tokens: 700,
          temperature: 0.2,
        }),
      1
    );
    const content = result.choices[0]?.message?.content ?? "";
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
  const ai = getAiClient();
  if (!ai) return null;

  const prompt = `
Eres un validador de KRs numericos. Devuelve SOLO un JSON valido con:
{
  "issues": [
    { "severity": "high|medium|low", "code": string, "message": string, "fixSuggestion": string }
  ],
  "suggestedTargetValue": number|null
}
Reglas: KR debe ser medible, cuantitativo y targetValue > 0.
Si no hay issues, issues: [].

Input:
${JSON.stringify(input)}
`;

  try {
    const result = await withRetry(
      () =>
        ai.chat.completions.create({
          model: AI_DEPLOYMENT ?? "",
          messages: [{ role: "developer", content: prompt }],
          max_completion_tokens: 500,
          temperature: 0.2,
        }),
      1
    );
    const content = result.choices[0]?.message?.content ?? "";
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
