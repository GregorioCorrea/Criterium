import { query } from "../db";
import { computeHealth, computeProgressPct, KrHealth } from "../domain/krHealth";

export type OkrSummary = {
  okrId: string;
  krCount: number;
  avgProgressPct: number | null;
  healthCounts: Record<KrHealth, number>;
  overallHealth: KrHealth;
};

function overallFromCounts(counts: Record<KrHealth, number>): KrHealth {
  // Regla simple y muy vendible:
  // si hay off_track -> off_track
  // sino si hay at_risk -> at_risk
  // sino si hay on_track -> on_track
  // sino si hay no_checkins -> no_checkins
  // sino -> no_target
  if (counts.off_track > 0) return "off_track";
  if (counts.at_risk > 0) return "at_risk";
  if (counts.on_track > 0) return "on_track";
  if (counts.no_checkins > 0) return "no_checkins";
  return "no_target";
}

export async function getOkrSummary(okrId: string): Promise<OkrSummary> {
  // Traemos solo lo necesario para calcular health y progress.
  const rows = await query<any>(
    `
    SELECT
      CAST(id as varchar(36)) as id,
      target_value as targetValue,
      current_value as currentValue
    FROM dbo.key_results
    WHERE okr_id = @okrId
    `,
    { okrId }
  );

  const healthCounts: Record<KrHealth, number> = {
    no_target: 0,
    no_checkins: 0,
    off_track: 0,
    at_risk: 0,
    on_track: 0,
  };

  let sumProgress = 0;
  let progressN = 0;

  for (const r of rows) {
    const cv = r.currentValue === null || r.currentValue === undefined ? null : Number(r.currentValue);
    const tv = r.targetValue === null || r.targetValue === undefined ? null : Number(r.targetValue);

    const h = computeHealth(cv, tv);
    healthCounts[h]++;

    const pct = computeProgressPct(cv, tv);
    if (pct !== null && Number.isFinite(pct)) {
      sumProgress += pct;
      progressN++;
    }
  }

  const avgProgressPct = progressN > 0 ? Math.round((sumProgress / progressN) * 10) / 10 : null;

  return {
    okrId,
    krCount: rows.length,
    avgProgressPct,
    healthCounts,
    overallHealth: overallFromCounts(healthCounts),
  };
}
