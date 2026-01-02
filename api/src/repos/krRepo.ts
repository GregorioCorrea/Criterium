import { query } from "../db";
import { computeHealth, computeProgressPct } from "../domain/krHealth";
import { KrRisk } from "../domain/insights";



export async function updateKrCurrentValue(
  tenantId: string,
  krId: string,
  value: number
): Promise<void> {
  await query(
    `
    UPDATE kr
    SET current_value = @value
    FROM dbo.key_results kr
    INNER JOIN dbo.okrs o ON kr.okr_id = o.id
    WHERE kr.id = @krId
      AND o.tenant_id = @tenantId
    `,
    { tenantId, krId, value }
  );
}

export type KRRow = {
  id: string;
  okrId: string;
  title: string;
  metricName: string | null;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  status: string | null;
  createdAt: string | null;

  // calculados
  progressPct: number | null;
  health: "no_target" | "no_checkins" | "off_track" | "at_risk" | "on_track";

  insights?: {
    explanationShort: string;
    explanationLong?: string;
    suggestion: string;
    risk: KrRisk | null;
    computedAt: string;
    source: string;
  } | null;
};


export async function listKrsByOkr(tenantId: string, okrId: string): Promise<KRRow[]> {
  const rows = await query<any>(
    `
    SELECT
      CAST(kr.id as varchar(36)) as id,
      CAST(kr.okr_id as varchar(36)) as okrId,
      kr.title,
      kr.metric_name as metricName,
      kr.target_value as targetValue,
      kr.current_value as currentValue,
      kr.unit,
      kr.status,
      CONVERT(varchar(19), kr.created_at, 120) as createdAt,
      ki.explanation_short as insightShort,
      ki.explanation_long as insightLong,
      ki.suggestion as insightSuggestion,
      ki.risk as insightRisk,
      CONVERT(varchar(19), ki.computed_at, 120) as insightComputedAt,
      ki.source as insightSource
    FROM dbo.key_results kr
    INNER JOIN dbo.okrs o ON kr.okr_id = o.id
    LEFT JOIN dbo.KrInsights ki
      ON ki.kr_id = kr.id AND ki.tenant_id = @tenantId
    WHERE kr.okr_id = @okrId
      AND o.tenant_id = @tenantId
    ORDER BY kr.created_at ASC
    `,
    { tenantId, okrId }
  );

  return rows.map((r: any) => {
    const currentValue =
      r.currentValue === null || r.currentValue === undefined ? null : Number(r.currentValue);
    const targetValue =
      r.targetValue === null || r.targetValue === undefined ? null : Number(r.targetValue);

    return {
      id: String(r.id),
      okrId: String(r.okrId),
      title: String(r.title),
      metricName: r.metricName ?? null,
      targetValue,
      currentValue,
      unit: r.unit ?? null,
      status: r.status ?? null,
      createdAt: r.createdAt ?? null,

      // calculados
      progressPct: computeProgressPct(currentValue, targetValue),
      health: computeHealth(currentValue, targetValue),
      insights: r.insightShort
        ? {
            explanationShort: String(r.insightShort),
            explanationLong: r.insightLong ? String(r.insightLong) : undefined,
            suggestion: r.insightSuggestion ? String(r.insightSuggestion) : "",
            risk: r.insightRisk ?? null,
            computedAt: r.insightComputedAt ? String(r.insightComputedAt) : "",
            source: r.insightSource ? String(r.insightSource) : "",
          }
        : null,
    } as KRRow;
  });
}

export async function createKr(input: {
  okrId: string;
  title: string;
  metricName?: string;
  targetValue?: number;
  unit?: string;
}): Promise<KRRow> {
  const rows = await query<KRRow>(
    `
    INSERT INTO dbo.key_results
      (id, okr_id, title, metric_name, target_value, current_value, unit, status, created_at)
    OUTPUT
      CAST(inserted.id as varchar(36)) as id,
      CAST(inserted.okr_id as varchar(36)) as okrId,
      inserted.title,
      inserted.metric_name as metricName,
      inserted.target_value as targetValue,
      inserted.current_value as currentValue,
      inserted.unit,
      inserted.status,
      CONVERT(varchar(19), inserted.created_at, 120) as createdAt
    VALUES
      (NEWID(), @okrId, @title, @metricName, @targetValue, 0, @unit, 'planned', SYSUTCDATETIME())
    `,
    {
      okrId: input.okrId,
      title: input.title,
      metricName: input.metricName ?? null,
      targetValue: input.targetValue ?? null,
      unit: input.unit ?? null,
    }
  );

  if (!rows[0]) throw new Error("No se pudo crear el KR.");
  return rows[0];
}

export async function getKrById(
  tenantId: string,
  krId: string
): Promise<{
  id: string;
  okrId: string;
  title: string;
  metricName: string | null;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
} | null> {
  const rows = await query<any>(
    `
    SELECT TOP 1
      CAST(kr.id as varchar(36)) as id,
      CAST(kr.okr_id as varchar(36)) as okrId,
      kr.title,
      kr.metric_name as metricName,
      kr.target_value as targetValue,
      kr.current_value as currentValue,
      kr.unit as unit
    FROM dbo.key_results kr
    INNER JOIN dbo.okrs o ON kr.okr_id = o.id
    WHERE kr.id = @krId
      AND o.tenant_id = @tenantId
    `,
    { tenantId, krId }
  );

  if (!rows[0]) return null;
  return {
    id: String(rows[0].id),
    okrId: String(rows[0].okrId),
    title: String(rows[0].title),
    metricName: rows[0].metricName ?? null,
    targetValue:
      rows[0].targetValue === null || rows[0].targetValue === undefined
        ? null
        : Number(rows[0].targetValue),
    currentValue:
      rows[0].currentValue === null || rows[0].currentValue === undefined
        ? null
        : Number(rows[0].currentValue),
    unit: rows[0].unit ?? null,
  };
}
