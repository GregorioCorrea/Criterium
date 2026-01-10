type GraphToken = {
  accessToken: string;
  expiresAt: number;
};

const tokenCache = new Map<string, GraphToken>();

export function getGraphTenantId(requestTenantId: string): string {
  return process.env.GRAPH_TENANT_ID || requestTenantId;
}

export function clearGraphTokenCache(): void {
  tokenCache.clear();
}

function nowMs(): number {
  return Date.now();
}

export async function getGraphAccessToken(tenantId: string): Promise<string> {
  const cached = tokenCache.get(tenantId);
  if (cached && cached.expiresAt > nowMs() + 60_000) {
    return cached.accessToken;
  }

  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.log("[graph] credentials missing", {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
    });
    throw new Error("graph_credentials_missing");
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  console.log("[graph] token authority", {
    tenantId,
    tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
  });
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("scope", "https://graph.microsoft.com/.default");
  body.set("grant_type", "client_credentials");

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`graph_token_error:${res.status}:${text}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  const accessToken = json.access_token;
  const expiresAt = nowMs() + (json.expires_in ?? 3600) * 1000;
  tokenCache.set(tenantId, { accessToken, expiresAt });
  return accessToken;
}

export async function graphGet<T>(tenantId: string, path: string): Promise<T> {
  const accessToken = await getGraphAccessToken(tenantId);
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`graph_request_error:${res.status}:${text}`);
  }
  return (await res.json()) as T;
}
