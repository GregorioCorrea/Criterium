import { query } from "../db";
import { KrRisk } from "../domain/insights";

export type KrInsightsRow = {
  id: string;
  tenantId: string;
  krId: string;
  risk: KrRisk | null;
  explanationShort: string;
  explanationLong: string;
  suggestion: string;
  computedAt: string;
  source: string;
  version: number;
};

export type OkrInsightsRow = {
  id: string;
  tenantId: string;
  okrId: string;
  explanationShort: string;
  explanationLong: string;
  suggestion: string;
  computedAt: string;
  source: string;
  version: number;
};

export async function upsertKrInsights(input: {
  tenantId: string;
  krId: string;
  risk: KrRisk;
  explanationShort: string;
  explanationLong: string;
  suggestion: string;
  source: string;
  version: number;
}): Promise<KrInsightsRow> {
  const rows = await query<KrInsightsRow>(
    `
    MERGE dbo.KrInsights AS target
    USING (
      SELECT
        CAST(@tenantId as uniqueidentifier) as tenant_id,
        CAST(@krId as uniqueidentifier) as kr_id
    ) AS src
    ON target.tenant_id = src.tenant_id AND target.kr_id = src.kr_id
    WHEN MATCHED THEN
      UPDATE SET
        risk = @risk,
        explanation_short = @explanationShort,
        explanation_long = @explanationLong,
        suggestion = @suggestion,
        computed_at = SYSUTCDATETIME(),
        source = @source,
        version = @version
    WHEN NOT MATCHED THEN
      INSERT (
        id, tenant_id, kr_id, risk, explanation_short, explanation_long,
        suggestion, computed_at, source, version
      )
      VALUES (
        NEWID(), src.tenant_id, src.kr_id, @risk, @explanationShort, @explanationLong,
        @suggestion, SYSUTCDATETIME(), @source, @version
      )
    OUTPUT
      CAST(inserted.id as varchar(36)) as id,
      CAST(inserted.tenant_id as varchar(36)) as tenantId,
      CAST(inserted.kr_id as varchar(36)) as krId,
      inserted.risk as risk,
      inserted.explanation_short as explanationShort,
      inserted.explanation_long as explanationLong,
      inserted.suggestion as suggestion,
      CONVERT(varchar(19), inserted.computed_at, 120) as computedAt,
      inserted.source as source,
      inserted.version as version
    `,
    {
      tenantId: input.tenantId,
      krId: input.krId,
      risk: input.risk,
      explanationShort: input.explanationShort,
      explanationLong: input.explanationLong,
      suggestion: input.suggestion,
      source: input.source,
      version: input.version,
    }
  );

  if (!rows[0]) throw new Error("No se pudo guardar KrInsights.");
  return rows[0];
}

export async function upsertOkrInsights(input: {
  tenantId: string;
  okrId: string;
  explanationShort: string;
  explanationLong: string;
  suggestion: string;
  source: string;
  version: number;
}): Promise<OkrInsightsRow> {
  const rows = await query<OkrInsightsRow>(
    `
    MERGE dbo.OkrInsights AS target
    USING (
      SELECT
        CAST(@tenantId as uniqueidentifier) as tenant_id,
        CAST(@okrId as uniqueidentifier) as okr_id
    ) AS src
    ON target.tenant_id = src.tenant_id AND target.okr_id = src.okr_id
    WHEN MATCHED THEN
      UPDATE SET
        explanation_short = @explanationShort,
        explanation_long = @explanationLong,
        suggestion = @suggestion,
        computed_at = SYSUTCDATETIME(),
        source = @source,
        version = @version
    WHEN NOT MATCHED THEN
      INSERT (
        id, tenant_id, okr_id, explanation_short, explanation_long,
        suggestion, computed_at, source, version
      )
      VALUES (
        NEWID(), src.tenant_id, src.okr_id, @explanationShort, @explanationLong,
        @suggestion, SYSUTCDATETIME(), @source, @version
      )
    OUTPUT
      CAST(inserted.id as varchar(36)) as id,
      CAST(inserted.tenant_id as varchar(36)) as tenantId,
      CAST(inserted.okr_id as varchar(36)) as okrId,
      inserted.explanation_short as explanationShort,
      inserted.explanation_long as explanationLong,
      inserted.suggestion as suggestion,
      CONVERT(varchar(19), inserted.computed_at, 120) as computedAt,
      inserted.source as source,
      inserted.version as version
    `,
    {
      tenantId: input.tenantId,
      okrId: input.okrId,
      explanationShort: input.explanationShort,
      explanationLong: input.explanationLong,
      suggestion: input.suggestion,
      source: input.source,
      version: input.version,
    }
  );

  if (!rows[0]) throw new Error("No se pudo guardar OkrInsights.");
  return rows[0];
}

export async function getKrInsightsByKrId(
  tenantId: string,
  krId: string
): Promise<KrInsightsRow | null> {
  const rows = await query<KrInsightsRow>(
    `
    SELECT TOP 1
      CAST(id as varchar(36)) as id,
      CAST(tenant_id as varchar(36)) as tenantId,
      CAST(kr_id as varchar(36)) as krId,
      risk,
      explanation_short as explanationShort,
      explanation_long as explanationLong,
      suggestion,
      CONVERT(varchar(19), computed_at, 120) as computedAt,
      source,
      version
    FROM dbo.KrInsights
    WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
      AND kr_id = CAST(@krId as uniqueidentifier)
    `,
    { tenantId, krId }
  );

  return rows[0] ?? null;
}

export async function getOkrInsightsByOkrId(
  tenantId: string,
  okrId: string
): Promise<OkrInsightsRow | null> {
  const rows = await query<OkrInsightsRow>(
    `
    SELECT TOP 1
      CAST(id as varchar(36)) as id,
      CAST(tenant_id as varchar(36)) as tenantId,
      CAST(okr_id as varchar(36)) as okrId,
      explanation_short as explanationShort,
      explanation_long as explanationLong,
      suggestion,
      CONVERT(varchar(19), computed_at, 120) as computedAt,
      source,
      version
    FROM dbo.OkrInsights
    WHERE tenant_id = CAST(@tenantId as uniqueidentifier)
      AND okr_id = CAST(@okrId as uniqueidentifier)
    `,
    { tenantId, okrId }
  );

  return rows[0] ?? null;
}
