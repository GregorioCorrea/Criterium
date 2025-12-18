import { query } from "../db";

export type KRRow = {
  id: string;
  okrId: string;
  title: string;
  metricName?: string;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
};

export async function listKrsByOkr(okrId: string): Promise<KRRow[]> {
  return await query<KRRow>(
    `
    SELECT
      CAST(id as varchar(36)) as id,
      CAST(okr_id as varchar(36)) as okrId,
      title,
      metric_name as metricName,
      target_value as targetValue,
      current_value as currentValue,
      unit
    FROM key_results
    WHERE okr_id = @okrId
    ORDER BY id ASC
    `,
    { okrId }
  );
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
    INSERT INTO key_results (id, okr_id, title, metric_name, target_value, current_value, unit, status)
    OUTPUT
      CAST(inserted.id as varchar(36)) as id,
      CAST(inserted.okr_id as varchar(36)) as okrId,
      inserted.title,
      inserted.metric_name as metricName,
      inserted.target_value as targetValue,
      inserted.current_value as currentValue,
      inserted.unit
    VALUES (NEWID(), @okrId, @title, @metricName, @targetValue, 0, @unit, 'planned')
    `,
    input
  );

  if (!rows[0]) throw new Error("No se pudo crear el KR.");
  return rows[0];
}
