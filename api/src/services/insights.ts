import { computeKrInsights, computeOkrInsights } from "../domain/insights";
import { listCheckinsByKr } from "../repos/checkinRepo";
import { upsertKrInsights, upsertOkrInsights } from "../repos/insightsRepo";
import { getKrById, listKrsByOkr } from "../repos/krRepo";

const INSIGHTS_SOURCE = "rules";
const INSIGHTS_VERSION = 1;

export async function recomputeKrAndOkrInsights(tenantId: string, krId: string): Promise<void> {
  const kr = await getKrById(tenantId, krId);
  if (!kr) {
    throw new Error("KR no encontrado para el tenant.");
  }

  const checkins = await listCheckinsByKr(tenantId, krId);
  const krInsight = computeKrInsights(
    { targetValue: kr.targetValue, currentValue: kr.currentValue },
    checkins.map((c) => ({ value: c.value }))
  );

  await upsertKrInsights({
    tenantId,
    krId: kr.id,
    risk: krInsight.risk,
    explanationShort: krInsight.explanationShort,
    explanationLong: krInsight.explanationLong,
    suggestion: krInsight.suggestion,
    source: INSIGHTS_SOURCE,
    version: INSIGHTS_VERSION,
  });

  await recomputeOkrInsights(tenantId, kr.okrId);
}

export async function recomputeOkrInsights(tenantId: string, okrId: string): Promise<void> {
  const krs = await listKrsByOkr(tenantId, okrId);
  const krInsights = krs
    .map((kr) => {
      if (kr.insights?.risk) {
        return { krId: kr.id, risk: kr.insights.risk };
      }
      const fallback = computeKrInsights(
        { targetValue: kr.targetValue, currentValue: kr.currentValue },
        []
      );
      return { krId: kr.id, risk: fallback.risk };
    })
    .filter(Boolean);

  const okrInsight = computeOkrInsights(
    krs.map((kr) => ({ id: kr.id })),
    krInsights
  );

  await upsertOkrInsights({
    tenantId,
    okrId,
    explanationShort: okrInsight.explanationShort,
    explanationLong: okrInsight.explanationLong,
    suggestion: okrInsight.suggestion,
    source: INSIGHTS_SOURCE,
    version: INSIGHTS_VERSION,
  });
}

export async function ensureInitialOkrInsights(tenantId: string, okrId: string): Promise<void> {
  const okrInsight = computeOkrInsights([], []);
  await upsertOkrInsights({
    tenantId,
    okrId,
    explanationShort: okrInsight.explanationShort,
    explanationLong: okrInsight.explanationLong,
    suggestion: okrInsight.suggestion,
    source: INSIGHTS_SOURCE,
    version: INSIGHTS_VERSION,
  });
}
