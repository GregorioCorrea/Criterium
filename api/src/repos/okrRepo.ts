import { query } from "../db";

export type OKRRow = {
  id: string;
  objective: string;
  fromDate: string;
  toDate: string;
  createdAt: string;
};

export async function listOkrsByTenant(
  tenantId: string
): Promise<OKRRow[]> {
  return query<OKRRow>(
    `
    SELECT
      CAST(id as varchar(36)) as id,
      objective,
      CONVERT(varchar(10), from_date, 23) as fromDate,
      CONVERT(varchar(10), to_date, 23) as toDate,
      CONVERT(varchar(19), created_at, 120) as createdAt
    FROM okrs
    WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
    ORDER BY created_at DESC
    `,
    { tenantId }
  );
  console.log("Listing OKRs for tenant:", tenantId);
}

export async function createOkr(
  tenantId: string,
  input: { objective: string; fromDate: string; toDate: string }
): Promise<OKRRow> {
  const rows = await query<OKRRow>(
    `
    INSERT INTO okrs (id, tenant_id, objective, from_date, to_date, created_at)
    OUTPUT
      CAST(inserted.id as varchar(36)) as id,
      inserted.objective,
      CONVERT(varchar(10), inserted.from_date, 23),
      CONVERT(varchar(10), inserted.to_date, 23),
      CONVERT(varchar(19), inserted.created_at, 120)
    VALUES (NEWID(), CAST(@tenantId as uniqueidentifier), @objective, @fromDate, @toDate, SYSUTCDATETIME())
    `,
    {
      tenantId,
      objective: input.objective,
      fromDate: input.fromDate,
      toDate: input.toDate,
    }
  );

  if (!rows[0]) throw new Error("OKR not created");
  return rows[0];
}

export async function okrExists(tenantId: string, okrId: string): Promise<boolean> {
  const rows = await query<any>(
    `
    SELECT TOP 1 1 as ok
    FROM dbo.okrs
    WHERE id = CAST(@okrId as uniqueidentifier)
      AND tenant_id = CAST(@tenantId as uniqueidentifier)
    `,
    { tenantId, okrId }
  );
  return !!rows[0];
}
