import { query } from "../db";
import { computeHealth, computeProgressPct } from "../domain/krHealth";



export async function updateKrCurrentValue(krId: string, value: number): Promise<void> {
  await query(
    `
    UPDATE dbo.key_results
    SET current_value = @value
    WHERE id = @krId
    `,
    { krId, value }
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
};


export async function listKrsByOkr(okrId: string): Promise<KRRow[]> {
  const rows = await query<any>(
    `
    SELECT
      CAST(id as varchar(36)) as id,
      CAST(okr_id as varchar(36)) as okrId,
      title,
      metric_name as metricName,
      target_value as targetValue,
      current_value as currentValue,
      unit,
      status,
      CONVERT(varchar(19), created_at, 120) as createdAt
    FROM dbo.key_results
    WHERE okr_id = @okrId
    ORDER BY created_at ASC
    `,
    { okrId }
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
