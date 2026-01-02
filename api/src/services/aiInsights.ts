import { AzureOpenAI } from "openai";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import { KrRisk } from "../domain/insights";

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

const AI_ENABLED = (process.env.INSIGHTS_AI_ENABLED || "").toLowerCase() === "true";
const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT;
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2025-01-01-preview";

let client: AzureOpenAI | null = null;

function getClient(): AzureOpenAI | null {
  if (!AI_ENABLED) return null;
  if (!ENDPOINT || !DEPLOYMENT) return null;
  if (client) return client;

  console.log("[ai] Azure OpenAI enabled", {
    endpoint: ENDPOINT,
    deployment: DEPLOYMENT,
    apiVersion: API_VERSION,
  });

  const credential = new DefaultAzureCredential();
  const scope = "https://cognitiveservices.azure.com/.default";
  const azureADTokenProvider = getBearerTokenProvider(credential, scope);

  client = new AzureOpenAI({
    endpoint: ENDPOINT,
    azureADTokenProvider,
    apiVersion: API_VERSION,
    deployment: DEPLOYMENT,
  });

  return client;
}

function safeParseJson<T>(text: string): T | null {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch ? fencedMatch[1] : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

function normalizeRisk(risk: string | undefined | null): KrRisk | null {
  if (!risk) return null;
  const v = risk.toLowerCase().trim();
  if (v === "low" || v === "medium" || v === "high") return v;
  return null;
}

export async function generateKrInsightsAi(input: KrAiInput): Promise<KrAiOutput | null> {
  const ai = getClient();
  if (!ai) return null;

  const prompt = `
Eres un analista de OKRs. Devuelve SOLO un JSON valido.
Campos obligatorios:
- explanationShort (string <= 280)
- explanationLong (string)
- suggestion (string <= 280)
- risk (low|medium|high)

Datos:
${JSON.stringify(input)}
`;

  try {
    const result = await ai.chat.completions.create({
      messages: [{ role: "developer", content: prompt }],
      max_completion_tokens: 500,
      temperature: 0.2,
    });

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
  const ai = getClient();
  if (!ai) return null;

  const prompt = `
Eres un analista de OKRs. Devuelve SOLO un JSON valido.
Campos obligatorios:
- explanationShort (string <= 280)
- explanationLong (string)
- suggestion (string <= 280)

Datos:
${JSON.stringify(input)}
`;

  try {
    const result = await ai.chat.completions.create({
      messages: [{ role: "developer", content: prompt }],
      max_completion_tokens: 500,
      temperature: 0.2,
    });

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
