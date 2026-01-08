import { query } from "../db";

export type OkrAlignmentRow = {
  parentOkrId: string;
  childOkrId: string;
  createdAt: string;
};

export type AlignedOkr = {
  id: string;
  objective: string;
  fromDate: string;
  toDate: string;
  status: string;
};

export async function listAlignmentPairs(tenantId: string): Promise<OkrAlignmentRow[]> {
  const rows = await query<any>(
    `
    SELECT
      CAST(parent_okr_id as varchar(36)) as parentOkrId,
      CAST(child_okr_id as varchar(36)) as childOkrId,
      CONVERT(varchar(19), created_at, 120) as createdAt
    FROM dbo.OkrAlignments
    WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
    `,
    { tenantId }
  );

  return rows.map((r: any) => ({
    parentOkrId: String(r.parentOkrId),
    childOkrId: String(r.childOkrId),
    createdAt: String(r.createdAt),
  }));
}

export async function listAlignedTo(tenantId: string, okrId: string): Promise<AlignedOkr[]> {
  const rows = await query<any>(
    `
    SELECT
      CAST(o.id as varchar(36)) as id,
      o.objective,
      CONVERT(varchar(10), o.from_date, 120) as fromDate,
      CONVERT(varchar(10), o.to_date, 120) as toDate,
      o.status
    FROM dbo.OkrAlignments a
    INNER JOIN dbo.okrs o ON o.id = a.parent_okr_id
    WHERE a.tenant_id = CAST(@tenantId as uniqueidentifier)
      AND a.child_okr_id = CAST(@okrId as uniqueidentifier)
    ORDER BY o.from_date DESC
    `,
    { tenantId, okrId }
  );

  return rows.map((r: any) => ({
    id: String(r.id),
    objective: String(r.objective),
    fromDate: String(r.fromDate),
    toDate: String(r.toDate),
    status: String(r.status),
  }));
}

export async function listAlignedFrom(tenantId: string, okrId: string): Promise<AlignedOkr[]> {
  const rows = await query<any>(
    `
    SELECT
      CAST(o.id as varchar(36)) as id,
      o.objective,
      CONVERT(varchar(10), o.from_date, 120) as fromDate,
      CONVERT(varchar(10), o.to_date, 120) as toDate,
      o.status
    FROM dbo.OkrAlignments a
    INNER JOIN dbo.okrs o ON o.id = a.child_okr_id
    WHERE a.tenant_id = CAST(@tenantId as uniqueidentifier)
      AND a.parent_okr_id = CAST(@okrId as uniqueidentifier)
    ORDER BY o.from_date DESC
    `,
    { tenantId, okrId }
  );

  return rows.map((r: any) => ({
    id: String(r.id),
    objective: String(r.objective),
    fromDate: String(r.fromDate),
    toDate: String(r.toDate),
    status: String(r.status),
  }));
}

export async function addAlignment(
  tenantId: string,
  parentOkrId: string,
  childOkrId: string
): Promise<void> {
  await query(
    `
    IF NOT EXISTS (
      SELECT 1
      FROM dbo.OkrAlignments
      WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
        AND parent_okr_id = CAST(@parentOkrId as uniqueidentifier)
        AND child_okr_id = CAST(@childOkrId as uniqueidentifier)
    )
    BEGIN
      INSERT INTO dbo.OkrAlignments (tenant_id, parent_okr_id, child_okr_id, created_at)
      VALUES (CAST(@tenantId as uniqueidentifier), CAST(@parentOkrId as uniqueidentifier), CAST(@childOkrId as uniqueidentifier), SYSUTCDATETIME())
    END
    `,
    { tenantId, parentOkrId, childOkrId }
  );
}

export async function removeAlignment(
  tenantId: string,
  parentOkrId: string,
  childOkrId: string
): Promise<void> {
  await query(
    `
    DELETE FROM dbo.OkrAlignments
    WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
      AND parent_okr_id = CAST(@parentOkrId as uniqueidentifier)
      AND child_okr_id = CAST(@childOkrId as uniqueidentifier)
    `,
    { tenantId, parentOkrId, childOkrId }
  );
}

export async function hasAlignmentPath(
  tenantId: string,
  fromOkrId: string,
  toOkrId: string
): Promise<boolean> {
  const rows = await query<any>(
    `
    WITH paths AS (
      SELECT parent_okr_id, child_okr_id
      FROM dbo.OkrAlignments
      WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
        AND parent_okr_id = CAST(@fromOkrId as uniqueidentifier)
      UNION ALL
      SELECT a.parent_okr_id, a.child_okr_id
      FROM dbo.OkrAlignments a
      INNER JOIN paths p ON a.parent_okr_id = p.child_okr_id
      WHERE a.tenant_id = CAST(@tenantId as uniqueidentifier)
    )
    SELECT TOP 1 1 as found
    FROM paths
    WHERE child_okr_id = CAST(@toOkrId as uniqueidentifier)
    `,
    { tenantId, fromOkrId, toOkrId }
  );

  return !!rows[0];
}
