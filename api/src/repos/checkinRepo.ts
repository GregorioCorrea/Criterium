import { query } from "../db";

export type CheckinRow = {
  id: string;
  tenantId: string;
  keyResultId: string;
  value: number;
  comment: string | null;
  createdAt: string;
  createdByUserId: string | null;
};

export async function listCheckinsByKr(krId: string) {
  // NOTA: pasamos krId como string, pero SQL lo castea a uniqueidentifier de forma explícita
  const rows = await query<any>(
    `
    SELECT
      id,
      tenant_id,
      key_result_id,
      value,
      comment,
      created_at,
      created_by_user_id
    FROM dbo.kr_checkins
    WHERE key_result_id = CAST(@krId AS uniqueidentifier)
    ORDER BY created_at DESC
    `,
    { krId }
  );

  // Convertimos a string en JS, que no falla.
  return rows.map((r: any) => ({
    id: String(r.id),
    tenantId: String(r.tenant_id),
    keyResultId: String(r.key_result_id),
    value: Number(r.value),
    comment: r.comment ?? null,
    createdAt: r.created_at ? String(r.created_at).slice(0, 19).replace("T", " ") : null,
    createdByUserId: r.created_by_user_id ? String(r.created_by_user_id) : null,
  }));
}


export async function createCheckin(input: {
  tenantId: string;
  krId: string;
  value: number;
  comment?: string | null;
  createdByUserId?: string | null;
}): Promise<CheckinRow> {
  const rows = await query<CheckinRow>(
    `
    INSERT INTO dbo.kr_checkins
      (id, tenant_id, key_result_id, value, comment, created_at, created_by_user_id)
    OUTPUT
      CAST(inserted.id as varchar(36)) as id,
      CAST(inserted.tenant_id as varchar(36)) as tenantId,
      CAST(inserted.key_result_id as varchar(36)) as keyResultId,
      CAST(inserted.value as float) as value,
      inserted.comment as comment,
      CONVERT(varchar(19), inserted.created_at, 120) as createdAt,
      CASE WHEN inserted.created_by_user_id IS NULL THEN NULL ELSE CAST(inserted.created_by_user_id as varchar(36)) END as createdByUserId
    VALUES
      (NEWID(), @tenantId, @krId, @value, @comment, SYSUTCDATETIME(), @createdByUserId)
    `,
    {
      tenantId: input.tenantId,
      krId: input.krId,
      value: input.value,
      comment: input.comment ?? null,
      createdByUserId: input.createdByUserId ?? null,
    }
  );

  if (!rows[0]) throw new Error("No se pudo crear el check-in.");
  return rows[0];
}
