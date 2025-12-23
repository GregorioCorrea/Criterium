import { query } from "../db";
import { getOkrSummary } from "./okrSummaryRepo";
import { listKrsByOkr } from "./krRepo";

export async function getOkrDetail(tenantId: string, okrId: string) {
  const okrRows = await query<any>(
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
    { okrId, tenantId }
  );

  if (!okrRows[0]) return null;

  const okr = okrRows[0];
  const [summary, krs] = await Promise.all([
    getOkrSummary(tenantId, okrId),
    listKrsByOkr(okrId),
  ]);

  return { ...okr, summary, krs };
}
