import { AzureOpenAI } from "openai";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";

const AI_ENABLED = (process.env.INSIGHTS_AI_ENABLED || "").toLowerCase() === "true";
const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT;
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2025-01-01-preview";
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 12000);

let client: AzureOpenAI | null = null;

export function getAiDeployment(): string | null {
  return DEPLOYMENT ?? null;
}

export function isAiEnabled(): boolean {
  return AI_ENABLED;
}

export function getAiClient(): AzureOpenAI | null {
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

export function safeParseJson<T>(text: string): T | null {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch ? fencedMatch[1] : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }
  throw lastErr;
}

export async function withTimeout<T>(fn: () => Promise<T>, timeoutMs = AI_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("ai_timeout")), timeoutMs);
    fn()
      .then((value) => resolve(value))
      .catch((err) => reject(err))
      .finally(() => {
        if (timer) clearTimeout(timer);
      });
  });
}

export function getAiTimeoutMs(): number {
  return AI_TIMEOUT_MS;
}
