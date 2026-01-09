import { graphGet, getGraphTenantId } from "./graphClient";
import { ResolvedUser, UserResolver } from "./userResolver";

type GraphUser = {
  id: string;
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
};

type GraphUserResult = {
  value: GraphUser[];
};

type CacheEntry = {
  value: ResolvedUser;
  expiresAt: number;
};

const userCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function nowMs(): number {
  return Date.now();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function cacheKey(tenantId: string, email: string): string {
  return `${tenantId}:${normalizeEmail(email)}`;
}

export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 1) return "***";
  return `${trimmed[0]}***${trimmed.slice(at)}`;
}

export class GraphUserResolver implements UserResolver {
  async resolveByEmail(tenantId: string, email: string): Promise<ResolvedUser> {
    const key = cacheKey(tenantId, email);
    const cached = userCache.get(key);
    if (cached && cached.expiresAt > nowMs()) {
      return cached.value;
    }

    const tenant = getGraphTenantId(tenantId);
    const normalized = normalizeEmail(email);
    const filter = encodeURIComponent(
      `mail eq '${normalized}' or userPrincipalName eq '${normalized}'`
    );
    const result = await graphGet<GraphUserResult>(
      tenant,
      `/users?$filter=${filter}&$select=id,displayName,mail,userPrincipalName`
    );

    if (!result.value || result.value.length === 0) {
      throw new Error("graph_user_not_found");
    }
    if (result.value.length > 1) {
      throw new Error("graph_user_ambiguous");
    }

    const user = result.value[0];
    const resolved: ResolvedUser = {
      userObjectId: user.id,
      displayName: user.displayName ?? null,
      email: user.mail ?? user.userPrincipalName ?? normalized,
    };
    userCache.set(key, { value: resolved, expiresAt: nowMs() + CACHE_TTL_MS });
    return resolved;
  }
}
