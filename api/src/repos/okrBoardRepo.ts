import { query } from "../db";
import { getOkrSummary, OkrSummary } from "./okrSummaryRepo";

export type OkrBoardRow = {
  id: string;
  objective: string;
  fromDate: string;
  toDate: string;
  status: string;
  summary: OkrSummary;
  insights?: {
    explanationShort: string;
    suggestion: string;
    computedAt: string;
    source: string;
  } | null;
};

export async function listOkrsWithSummary(tenantId: string): Promise<OkrBoardRow[]> {
  const okrs = await query<any>(
    `
    SELECT
      CAST(o.id as varchar(36)) as id,
      o.objective,
      CONVERT(varchar(10), o.from_date, 120) as fromDate,
      CONVERT(varchar(10), o.to_date, 120) as toDate,
      o.status,
      oi.explanation_short as insightShort,
      oi.suggestion as insightSuggestion,
      CONVERT(varchar(19), oi.computed_at, 120) as insightComputedAt,
      oi.source as insightSource
    FROM dbo.okrs o
    LEFT JOIN dbo.OkrInsights oi
      ON oi.okr_id = o.id AND oi.tenant_id = @tenantId
    WHERE o.tenant_id = CAST(@tenantId as uniqueidentifier)
    ORDER BY o.from_date DESC
    `,
    { tenantId }
  );

  const result: OkrBoardRow[] = [];
  for (const o of okrs) {
    const summary = await getOkrSummary(tenantId, o.id);
    result.push({
      ...o,
      summary,
      insights: o.insightShort
        ? {
            explanationShort: String(o.insightShort),
            suggestion: o.insightSuggestion ? String(o.insightSuggestion) : "",
            computedAt: o.insightComputedAt ? String(o.insightComputedAt) : "",
            source: o.insightSource ? String(o.insightSource) : "",
          }
        : null,
    });
  }
  return result;
}
