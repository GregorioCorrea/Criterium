import { computeKrInsights, computeOkrInsights } from "../domain/insights";
import { computeHealth, computeProgressPct } from "../domain/krHealth";
import { listCheckinsByKr } from "../repos/checkinRepo";
import { upsertKrInsights, upsertOkrInsights } from "../repos/insightsRepo";
import { getKrById, listKrsByOkr } from "../repos/krRepo";
import { getOkrById } from "../repos/okrRepo";
import { generateKrInsightsAi, generateOkrInsightsAi } from "./aiInsights";

const INSIGHTS_SOURCE = "rules";
const INSIGHTS_VERSION = 1;
const AI_SOURCE = "ai";
const AI_VERSION = 2;

export async function recomputeKrAndOkrInsights(tenantId: string, krId: string): Promise<void> {
  const kr = await getKrById(tenantId, krId);
  if (!kr) {
    throw new Error("KR no encontrado para el tenant.");
  }

  const checkins = await listCheckinsByKr(tenantId, krId);
  const krInsightRules = computeKrInsights(
    { targetValue: kr.targetValue, currentValue: kr.currentValue },
    checkins.map((c) => ({ value: c.value }))
  );

  const krInsightAi = await generateKrInsightsAi({
    title: kr.title,
    metricName: kr.metricName,
    targetValue: kr.targetValue,
    currentValue: kr.currentValue,
    progressPct: computeProgressPct(kr.currentValue, kr.targetValue),
    health: computeHealth(kr.currentValue, kr.targetValue),
    checkinsCount: checkins.length,
    lastCheckinValue: checkins[0]?.value ?? null,
  });

  const krInsight = krInsightAi ?? krInsightRules;

  await upsertKrInsights({
    tenantId,
    krId: kr.id,
    risk: krInsight.risk,
    explanationShort: krInsight.explanationShort,
    explanationLong: krInsight.explanationLong,
    suggestion: krInsight.suggestion,
    source: krInsightAi ? AI_SOURCE : INSIGHTS_SOURCE,
    version: krInsightAi ? AI_VERSION : INSIGHTS_VERSION,
  });

  await recomputeOkrInsights(tenantId, kr.okrId);
}

export async function recomputeOkrInsights(tenantId: string, okrId: string): Promise<void> {
  const krs = await listKrsByOkr(tenantId, okrId);
  const okr = await getOkrById(tenantId, okrId);
  if (!okr) return;

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

  const okrInsightRules = computeOkrInsights(
    krs.map((kr) => ({ id: kr.id })),
    krInsights
  );

  const okrInsightAi = await generateOkrInsightsAi({
    objective: okr.objective,
    fromDate: okr.fromDate,
    toDate: okr.toDate,
    status: okr.status,
    krs: krs.map((kr) => ({
      id: kr.id,
      title: kr.title,
      progressPct: kr.progressPct,
      health: kr.health,
      insightsShort: kr.insights?.explanationShort ?? null,
      risk: kr.insights?.risk ?? null,
    })),
  });

  const okrInsight = okrInsightAi ?? okrInsightRules;

  await upsertOkrInsights({
    tenantId,
    okrId,
    explanationShort: okrInsight.explanationShort,
    explanationLong: okrInsight.explanationLong,
    suggestion: okrInsight.suggestion,
    source: okrInsightAi ? AI_SOURCE : INSIGHTS_SOURCE,
    version: okrInsightAi ? AI_VERSION : INSIGHTS_VERSION,
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
