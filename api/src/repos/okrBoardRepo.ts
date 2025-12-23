import { query } from "../db";
import { getOkrSummary, OkrSummary } from "./okrSummaryRepo";

export type OkrBoardRow = {
  id: string;
  objective: string;
  fromDate: string;
  toDate: string;
  status: string;
  summary: OkrSummary;
};

export async function listOkrsWithSummary(tenantId: string): Promise<OkrBoardRow[]> {
  const okrs = await query<any>(
    `
    SELECT
      CAST(id as varchar(36)) as id,
      objective,
      CONVERT(varchar(10), from_date, 120) as fromDate,
      CONVERT(varchar(10), to_date, 120) as toDate,
      status
    FROM dbo.okrs
    WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
    ORDER BY from_date DESC
    `,
    { tenantId }
  );

  const result: OkrBoardRow[] = [];
  for (const o of okrs) {
    const summary = await getOkrSummary(tenantId, o.id);
    result.push({ ...o, summary });
  }
  return result;
}
