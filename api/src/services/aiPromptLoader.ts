import fs from "node:fs";
import path from "node:path";

type AiPromptConfig = {
  max_output_tokens?: Record<string, number>;
  reasoning?: { effort?: string };
};

const cache: Record<string, string> = {};
let configCache: AiPromptConfig | null = null;

function tryRead(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

export function loadPrompt(name: string): string {
  if (cache[name]) return cache[name];
  const candidates = [
    path.join(process.cwd(), "src", "ai-prompts", name),
    path.join(process.cwd(), "ai-prompts", name),
    path.join(__dirname, "..", "ai-prompts", name),
  ];
  for (const p of candidates) {
    const content = tryRead(p);
    if (content) {
      cache[name] = content;
      return content;
    }
  }
  return "";
}

export function loadAiPromptConfig(): AiPromptConfig {
  if (configCache) return configCache;
  const candidates = [
    path.join(process.cwd(), "src", "ai-prompts", "config.json"),
    path.join(process.cwd(), "ai-prompts", "config.json"),
    path.join(__dirname, "..", "ai-prompts", "config.json"),
  ];
  for (const p of candidates) {
    const content = tryRead(p);
    if (content) {
      try {
        configCache = JSON.parse(content);
        return configCache;
      } catch {
        break;
      }
    }
  }
  configCache = {};
  return configCache;
}
