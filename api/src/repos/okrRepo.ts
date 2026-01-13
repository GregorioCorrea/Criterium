import { query, queryTx, withTransaction } from "../db";

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

export async function getOkrById(
  tenantId: string,
  okrId: string
): Promise<{ id: string; objective: string; fromDate: string; toDate: string; status: string } | null> {
  const rows = await query<any>(
    `
    SELECT TOP 1
      CAST(id as varchar(36)) as id,
      objective,
      CONVERT(varchar(10), from_date, 120) as fromDate,
      CONVERT(varchar(10), to_date, 120) as toDate,
      status
    FROM dbo.okrs
    WHERE id = CAST(@okrId as uniqueidentifier)
      AND tenant_id = CAST(@tenantId as uniqueidentifier)
    `,
    { tenantId, okrId }
  );

  if (!rows[0]) return null;
  return {
    id: String(rows[0].id),
    objective: String(rows[0].objective),
    fromDate: String(rows[0].fromDate),
    toDate: String(rows[0].toDate),
    status: String(rows[0].status),
  };
}

export async function getOkrDeleteInfo(
  tenantId: string,
  okrId: string
): Promise<{ okrId: string; krCount: number; checkinsCount: number } | null> {
  const rows = await query<any>(
    `
    SELECT
      COUNT(DISTINCT kr.id) as krCount,
      COUNT(kc.id) as checkinsCount
    FROM dbo.okrs o
    LEFT JOIN dbo.key_results kr ON kr.okr_id = o.id
    LEFT JOIN dbo.kr_checkins kc
      ON kc.key_result_id = kr.id
      AND kc.tenant_id = o.tenant_id
    WHERE o.id = CAST(@okrId as uniqueidentifier)
      AND o.tenant_id = CAST(@tenantId as uniqueidentifier)
    `,
    { tenantId, okrId }
  );

  if (!rows[0]) return null;
  return {
    okrId,
    krCount: Number(rows[0].krCount ?? 0),
    checkinsCount: Number(rows[0].checkinsCount ?? 0),
  };
}

export async function deleteOkrCascade(
  tenantId: string,
  okrId: string
): Promise<void> {
  await withTransaction(async (tx) => {
    await queryTx(
      tx,
      `
      DELETE FROM dbo.kr_checkins
      WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
        AND key_result_id IN (
          SELECT id
          FROM dbo.key_results
          WHERE okr_id = CAST(@okrId as uniqueidentifier)
        )
      `,
      { tenantId, okrId }
    );

    await queryTx(
      tx,
      `
      DELETE FROM dbo.KrInsights
      WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
        AND kr_id IN (
          SELECT id
          FROM dbo.key_results
          WHERE okr_id = CAST(@okrId as uniqueidentifier)
        )
      `,
      { tenantId, okrId }
    );

    await queryTx(
      tx,
      `
      DELETE FROM dbo.key_results
      WHERE okr_id = CAST(@okrId as uniqueidentifier)
        AND okr_id IN (
          SELECT id FROM dbo.okrs WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
        )
      `,
      { tenantId, okrId }
    );

    await queryTx(
      tx,
      `
      DELETE FROM dbo.OkrInsights
      WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
        AND okr_id = CAST(@okrId as uniqueidentifier)
      `,
      { tenantId, okrId }
    );

    await queryTx(
      tx,
      `
      DELETE FROM dbo.OkrAlignments
      WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
        AND (parent_okr_id = CAST(@okrId as uniqueidentifier)
          OR child_okr_id = CAST(@okrId as uniqueidentifier))
      `,
      { tenantId, okrId }
    );

    await queryTx(
      tx,
      `
      DELETE FROM dbo.OkrMembers
      WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
        AND okr_id = CAST(@okrId as uniqueidentifier)
      `,
      { tenantId, okrId }
    );

    await queryTx(
      tx,
      `
      DELETE FROM dbo.okrs
      WHERE id = CAST(@okrId as uniqueidentifier)
        AND tenant_id = CAST(@tenantId as uniqueidentifier)
      `,
      { tenantId, okrId }
    );
  });
}
