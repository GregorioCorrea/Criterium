// api/src/services/tenants.ts
import { query } from "../db"; // tu wrapper

export async function ensureTenantExists(tenantId: string) {
  // Ideal: tenés tabla tenants (id PK).
  // Si no existe, la creás (pero asumo que ya existe por tu código).
  await query(
    `
    INSERT INTO tenants (id, created_at)
    VALUES (@tenantId, GETUTCDATE())
    IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = @tenantId)
    `,
    { tenantId }
  ).catch(async () => {
    // Alternativa compatible (si tu DB no banca ese SQL tal cual):
    const existing = await query(`SELECT id FROM tenants WHERE id = @tenantId`, { tenantId });
    if (!existing?.length) {
      await query(`INSERT INTO tenants (id, created_at) VALUES (@tenantId, GETUTCDATE())`, { tenantId });
    }
  });
}
