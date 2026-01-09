import { query } from "../db";
import { getOkrSummary, OkrSummary } from "./okrSummaryRepo";
import { listAlignmentPairs } from "./okrAlignmentRepo";

export type OkrBoardRow = {
  id: string;
  objective: string;
  fromDate: string;
  toDate: string;
  status: string;
  summary: OkrSummary;
  alignedTo?: Array<{ id: string; objective: string; fromDate: string; toDate: string; status: string }>;
  alignedFrom?: Array<{ id: string; objective: string; fromDate: string; toDate: string; status: string }>;
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

  const alignmentPairs = await listAlignmentPairs(tenantId);
  const okrById = new Map<string, any>();
  for (const o of okrs) {
    okrById.set(String(o.id), o);
  }

  const result: OkrBoardRow[] = [];
  for (const o of okrs) {
    const alignedTo = alignmentPairs
      .filter((a) => a.childOkrId === String(o.id))
      .map((a) => okrById.get(a.parentOkrId))
      .filter(Boolean)
      .map((p: any) => ({
        id: String(p.id),
        objective: String(p.objective),
        fromDate: String(p.fromDate),
        toDate: String(p.toDate),
        status: String(p.status),
      }));
    const alignedFrom = alignmentPairs
      .filter((a) => a.parentOkrId === String(o.id))
      .map((a) => okrById.get(a.childOkrId))
      .filter(Boolean)
      .map((c: any) => ({
        id: String(c.id),
        objective: String(c.objective),
        fromDate: String(c.fromDate),
        toDate: String(c.toDate),
        status: String(c.status),
      }));
    const summary = await getOkrSummary(tenantId, o.id);
    result.push({
      ...o,
      summary,
      alignedTo,
      alignedFrom,
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

export async function listOkrsWithSummaryForUser(
  tenantId: string,
  userObjectId: string
): Promise<OkrBoardRow[]> {
  const okrs = await query<any>(
    `
    SELECT DISTINCT
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
    INNER JOIN dbo.OkrMembers om
      ON om.okr_id = o.id AND om.tenant_id = CAST(@tenantId as uniqueidentifier)
    LEFT JOIN dbo.OkrInsights oi
      ON oi.okr_id = o.id AND oi.tenant_id = @tenantId
    WHERE o.tenant_id = CAST(@tenantId as uniqueidentifier)
      AND om.user_object_id = CAST(@userObjectId as uniqueidentifier)
    ORDER BY o.from_date DESC
    `,
    { tenantId, userObjectId }
  );

  const alignmentPairs = await listAlignmentPairs(tenantId);
  const okrById = new Map<string, any>();
  for (const o of okrs) {
    okrById.set(String(o.id), o);
  }

  const result: OkrBoardRow[] = [];
  for (const o of okrs) {
    const alignedTo = alignmentPairs
      .filter((a) => a.childOkrId === String(o.id))
      .map((a) => okrById.get(a.parentOkrId))
      .filter(Boolean)
      .map((p: any) => ({
        id: String(p.id),
        objective: String(p.objective),
        fromDate: String(p.fromDate),
        toDate: String(p.toDate),
        status: String(p.status),
      }));
    const alignedFrom = alignmentPairs
      .filter((a) => a.parentOkrId === String(o.id))
      .map((a) => okrById.get(a.childOkrId))
      .filter(Boolean)
      .map((c: any) => ({
        id: String(c.id),
        objective: String(c.objective),
        fromDate: String(c.fromDate),
        toDate: String(c.toDate),
        status: String(c.status),
      }));
    const summary = await getOkrSummary(tenantId, o.id);
    result.push({
      ...o,
      summary,
      alignedTo,
      alignedFrom,
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
