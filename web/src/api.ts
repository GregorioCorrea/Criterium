const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

if (!API_BASE) {
  throw new Error("VITE_API_BASE_URL no está seteada (build-time). Revisá web/.env.production o el workflow.");
}

const DEFAULT_TENANT = import.meta.env.VITE_DEFAULT_TENANT_ID as string;

export async function apiGet<T>(path: string, tenantId?: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "x-tenant-id": tenantId ?? DEFAULT_TENANT,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return await res.json();
}
