import { query } from "../db";
import { getOkrSummary } from "./okrSummaryRepo";
import { listKrsByOkr } from "./krRepo";

export async function getOkrDetail(tenantId: string, okrId: string) {
  const okrRows = await query<any>(
    `
    SELECT TOP 1
      CAST(o.id as varchar(36)) as id,
      o.objective,
      CONVERT(varchar(10), o.from_date, 120) as fromDate,
      CONVERT(varchar(10), o.to_date, 120) as toDate,
      o.status,
      oi.explanation_short as insightShort,
      oi.explanation_long as insightLong,
      oi.suggestion as insightSuggestion,
      CONVERT(varchar(19), oi.computed_at, 120) as insightComputedAt,
      oi.source as insightSource
    FROM dbo.okrs o
    LEFT JOIN dbo.OkrInsights oi
      ON oi.okr_id = o.id AND oi.tenant_id = @tenantId
    WHERE o.id = CAST(@okrId as uniqueidentifier)
      AND o.tenant_id = CAST(@tenantId as uniqueidentifier)
    `,
    { okrId, tenantId }
  );

  if (!okrRows[0]) return null;

  const okr = okrRows[0];
  const [summary, krs] = await Promise.all([
    getOkrSummary(tenantId, okrId),
    listKrsByOkr(tenantId, okrId),
  ]);

  return {
    ...okr,
    summary,
    krs,
    insights: okr.insightShort
      ? {
          explanationShort: String(okr.insightShort),
          explanationLong: okr.insightLong ? String(okr.insightLong) : "",
          suggestion: okr.insightSuggestion ? String(okr.insightSuggestion) : "",
          computedAt: okr.insightComputedAt ? String(okr.insightComputedAt) : "",
          source: okr.insightSource ? String(okr.insightSource) : "",
        }
      : null,
  };
}
