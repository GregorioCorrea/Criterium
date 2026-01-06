import { KrRisk } from "../domain/insights";
import { getAiClient, getAiDeployment, safeParseJson, withRetry } from "./aiClient";

type KrAiInput = {
  title: string;
  metricName: string | null;
  targetValue: number | null;
  currentValue: number | null;
  progressPct: number | null;
  health: string;
  checkinsCount: number;
  lastCheckinValue: number | null;
};

type OkrAiInput = {
  objective: string;
  fromDate: string;
  toDate: string;
  status: string;
  krs: Array<{
    id: string;
    title: string;
    progressPct: number | null;
    health: string;
    insightsShort: string | null;
    risk: KrRisk | null;
  }>;
};

type KrAiOutput = {
  explanationShort: string;
  explanationLong: string;
  suggestion: string;
  risk: KrRisk;
};

type OkrAiOutput = {
  explanationShort: string;
  explanationLong: string;
  suggestion: string;
};

const AI_DEPLOYMENT = getAiDeployment();

function mapHealthLabel(health: string): string {
  switch (health) {
    case "no_target":
      return "sin target";
    case "no_checkins":
      return "sin avances";
    case "off_track":
      return "fuera de rumbo";
    case "at_risk":
      return "en riesgo";
    case "on_track":
      return "en rumbo";
    default:
      return "sin estado";
  }
}

function normalizeRisk(risk: string | undefined | null): KrRisk | null {
  if (!risk) return null;
  const v = risk.toLowerCase().trim();
  if (v === "low" || v === "medium" || v === "high") return v;
  return null;
}

export async function generateKrInsightsAi(input: KrAiInput): Promise<KrAiOutput | null> {
  const ai = getAiClient();
  if (!ai) return null;

  const enriched = {
    ...input,
    estado: mapHealthLabel(input.health),
  };

  const prompt = `
Eres un analista de OKRs. Devuelve SOLO un JSON valido.
Escribe en castellano. No uses la palabra "salud"; usa "estado".
Usa progressPct y estado para el diagnostico.
Si progressPct >= 100, indica que el objetivo esta alcanzado y sugiere mantener.
Campos obligatorios:
- explanationShort (string <= 280)
- explanationLong (string)
- suggestion (string <= 280)
- risk (low|medium|high)

Datos:
${JSON.stringify(enriched)}
`;

  try {
    const result = await withRetry(
      () =>
        ai.chat.completions.create({
          model: AI_DEPLOYMENT ?? "",
          messages: [{ role: "developer", content: prompt }],
          max_completion_tokens: 500,
          response_format: { type: "json_object" },
        }),
      1
    );

    const content = result.choices[0]?.message?.content ?? "";
    const parsed = safeParseJson<KrAiOutput>(content);
    if (!parsed) return null;
    const risk = normalizeRisk(parsed.risk);
    if (!risk) return null;
    console.log("[ai] KR insights generated");
    return { ...parsed, risk };
  } catch {
    console.warn("[ai] KR insights failed");
    return null;
  }
}

export async function generateOkrInsightsAi(input: OkrAiInput): Promise<OkrAiOutput | null> {
  const ai = getAiClient();
  if (!ai) return null;

  const enriched = {
    ...input,
    krs: input.krs.map((kr) => ({
      ...kr,
      estado: mapHealthLabel(kr.health),
    })),
  };

  const prompt = `
Eres un analista de OKRs. Devuelve SOLO un JSON valido.
Escribe en castellano. No uses la palabra "salud"; usa "estado".
Usa progressPct y estado de los KRs para el diagnostico general.
Campos obligatorios:
- explanationShort (string <= 280)
- explanationLong (string)
- suggestion (string <= 280)

Datos:
${JSON.stringify(enriched)}
`;

  try {
    const result = await withRetry(
      () =>
        ai.chat.completions.create({
          model: AI_DEPLOYMENT ?? "",
          messages: [{ role: "developer", content: prompt }],
          max_completion_tokens: 500,
          response_format: { type: "json_object" },
        }),
      1
    );

    const content = result.choices[0]?.message?.content ?? "";
    const parsed = safeParseJson<OkrAiOutput>(content);
    if (!parsed) return null;
    console.log("[ai] OKR insights generated");
    return parsed;
  } catch {
    console.warn("[ai] OKR insights failed");
    return null;
  }
}
