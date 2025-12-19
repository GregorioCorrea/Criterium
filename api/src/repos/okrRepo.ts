import { query } from "../db";
import { getDefaultTenantId } from "./tenantRepo";

export type OKRRow = {
  id: string;
  objective: string;
  fromDate: string;
  toDate: string;
  createdAt?: string;
};

export async function listOkrs(): Promise<OKRRow[]> {
  // AJUSTE: si tu tabla usa otros nombres de columnas, lo cambiamos.
  return await query<OKRRow>(`
    SELECT
      CAST(id as varchar(36)) as id,
      objective,
      CONVERT(varchar(10), from_date, 23) as fromDate,
      CONVERT(varchar(10), to_date, 23) as toDate,
      CONVERT(varchar(19), created_at, 120) as createdAt
    FROM okrs
    ORDER BY created_at DESC
  `);
}

/*
export async function createOkr(input: {
  objective: string;
  fromDate: string;
  toDate: string;
}): Promise<OKRRow> {
  const rows = await query<OKRRow>(
    `
    INSERT INTO okrs (id, objective, from_date, to_date, created_at)
    OUTPUT
      CAST(inserted.id as varchar(36)) as id,
      inserted.objective as objective,
      CONVERT(varchar(10), inserted.from_date, 23) as fromDate,
      CONVERT(varchar(10), inserted.to_date, 23) as toDate,
      CONVERT(varchar(19), inserted.created_at, 120) as createdAt
    VALUES (NEWID(), @objective, @from_date, @to_date, SYSUTCDATETIME())
  `,
    {
      objective: input.objective,
      from_date: input.fromDate,
      to_date: input.toDate,
    }
  );

  if (!rows[0]) throw new Error("No se pudo crear el OKR.");
  return rows[0];
*/

export async function createOkr(input: {
  objective: string;
  fromDate: string;
  toDate: string;
}): Promise<OKRRow> {

  const tenantId = await getDefaultTenantId();

  const rows = await query<OKRRow>(
    `
    INSERT INTO okrs (id, tenant_id, objective, from_date, to_date, created_at)
    OUTPUT
      CAST(inserted.id as varchar(36)) as id,
      inserted.objective as objective,
      CONVERT(varchar(10), inserted.from_date, 23) as fromDate,
      CONVERT(varchar(10), inserted.to_date, 23) as toDate,
      CONVERT(varchar(19), inserted.created_at, 120) as createdAt
    VALUES (NEWID(), @tenant_id, @objective, @from_date, @to_date, SYSUTCDATETIME())
    `,
    {
      tenant_id: tenantId,
      objective: input.objective,
      from_date: input.fromDate,
      to_date: input.toDate,
    }
  );

  if (!rows[0]) throw new Error("No se pudo crear el OKR.");
  return rows[0];
}


