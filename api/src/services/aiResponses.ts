import { DefaultAzureCredential } from "@azure/identity";

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT;
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2025-01-01-preview";
const AI_ENABLED = (process.env.INSIGHTS_AI_ENABLED || "").toLowerCase() === "true";

let cachedToken: { value: string; expiresOn: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresOn > now + 60_000) return cachedToken.value;
  const credential = new DefaultAzureCredential();
  const token = await credential.getToken("https://cognitiveservices.azure.com/.default");
  if (!token) throw new Error("no_token");
  cachedToken = {
    value: token.token,
    expiresOn: token.expiresOnTimestamp ?? now + 5 * 60_000,
  };
  return cachedToken.value;
}

function extractText(output: any): string {
  if (!output) return "";
  if (typeof output.output_text === "string") return output.output_text;
  if (Array.isArray(output.output)) {
    const chunks: string[] = [];
    for (const item of output.output) {
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (typeof c?.text === "string") chunks.push(c.text);
        }
      }
    }
    return chunks.join("");
  }
  return "";
}

export async function callResponsesApi(input: {
  system: string;
  user: string;
  maxOutputTokens: number;
  responseFormat?: { type: "json_object" };
  reasoningEffort?: string;
}): Promise<{ text: string; raw: any } | null> {
  if (!AI_ENABLED || !ENDPOINT || !DEPLOYMENT) return null;
  const token = await getAccessToken();
  const url = `${ENDPOINT}openai/deployments/${DEPLOYMENT}/responses?api-version=${API_VERSION}`;

  const body: any = {
    model: DEPLOYMENT,
    input: [
      { role: "system", content: [{ type: "text", text: input.system }] },
      { role: "user", content: [{ type: "text", text: input.user }] },
    ],
    max_output_tokens: input.maxOutputTokens,
  };

  if (input.responseFormat) {
    body.response_format = input.responseFormat;
  }
  if (input.reasoningEffort) {
    body.reasoning = { effort: input.reasoningEffort };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`responses_api_error: ${res.status} ${text}`);
  }

  const json = await res.json();
  const text = extractText(json);
  return { text, raw: json };
}
