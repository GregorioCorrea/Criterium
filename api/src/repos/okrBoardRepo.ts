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

export async function listOkrsWithSummary(): Promise<OkrBoardRow[]> {
  const okrs = await query<any>(
    `
    SELECT
      CAST(id as varchar(36)) as id,
      objective,
      CONVERT(varchar(10), from_date, 120) as fromDate,
      CONVERT(varchar(10), to_date, 120) as toDate,
      status
    FROM dbo.okrs
    ORDER BY from_date DESC
    `
  );

  const result: OkrBoardRow[] = [];

  for (const o of okrs) {
    const summary = await getOkrSummary(o.id);
    result.push({
      id: o.id,
      objective: o.objective,
      fromDate: o.fromDate,
      toDate: o.toDate,
      status: o.status,
      summary,
    });
  }

  return result;
}
