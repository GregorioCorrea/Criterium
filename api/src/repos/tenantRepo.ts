import { query } from "../db";

let cachedTenantId: string | null = null;

/**
 * Devuelve un tenant_id usable.
 * - Si existe DEFAULT_TENANT_ID en env, lo usa.
 * - Si no, busca/crea un tenant "default" en la tabla tenants y lo cachea.
 */
export async function getDefaultTenantId(): Promise<string> {
  const fromEnv = process.env.DEFAULT_TENANT_ID;
  if (fromEnv) return fromEnv;

  if (cachedTenantId) return cachedTenantId;

  const existing = await query<{ id: string }>(`
    SELECT TOP 1 CAST(id as varchar(36)) as id
    FROM tenants
    WHERE name = 'default'
    ORDER BY created_at ASC
  `);

  if (existing[0]?.id) {
    cachedTenantId = existing[0].id;
    return cachedTenantId;
  }

  const created = await query<{ id: string }>(`
    INSERT INTO tenants (name, domain, created_at)
    OUTPUT CAST(inserted.id as varchar(36)) as id
    VALUES ('default', NULL, SYSUTCDATETIME())
  `);

  if (!created[0]?.id) throw new Error("No pude crear el tenant default.");

  cachedTenantId = created[0].id;
  return cachedTenantId;
}
