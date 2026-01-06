import { computeProgressPct } from "../krHealth";

export type KrRisk = "low" | "medium" | "high";

export type KrInsightsInput = {
  targetValue: number | null;
  currentValue: number | null;
};

export type KrInsightsOutput = {
  explanationShort: string;
  explanationLong: string;
  suggestion: string;
  risk: KrRisk;
};

export type OkrInsightsOutput = {
  explanationShort: string;
  explanationLong: string;
  suggestion: string;
};

export function computeKrInsights(
  kr: KrInsightsInput,
  checkins: Array<{ value: number }>
): KrInsightsOutput {
  const hasTarget = kr.targetValue !== null && kr.targetValue !== undefined && kr.targetValue > 0;
  const hasCheckins =
    checkins.length > 0 ||
    (kr.currentValue !== null && kr.currentValue !== undefined);

  if (!hasTarget) {
    return {
      explanationShort: "Sin target definido",
      explanationLong:
        "Este KR no tiene un target numerico definido, por lo que no se puede evaluar el avance.",
      suggestion: "Defini un target numerico y una fecha",
      risk: "high",
    };
  }

  if (!hasCheckins) {
    return {
      explanationShort: "Sin avances registrados",
      explanationLong: "Aun no hay avances registrados para este KR.",
      suggestion: "Carga el primer avance con el valor actual",
      risk: "high",
    };
  }

  const pct = computeProgressPct(kr.currentValue, kr.targetValue) ?? 0;

  if (pct < 40) {
    return {
      explanationShort: "Fuera de rumbo",
      explanationLong: "El progreso actual esta por debajo de 40% del target.",
      suggestion: "Defini 1-2 iniciativas y aumenta la frecuencia de check-in",
      risk: "high",
    };
  }

  if (pct < 70) {
    return {
      explanationShort: "En riesgo",
      explanationLong: "El progreso actual esta entre 40% y 70% del target.",
      suggestion: "Ajusta iniciativas y revisa el ritmo semanal",
      risk: "medium",
    };
  }

  return {
    explanationShort: "En rumbo",
    explanationLong: "El progreso actual supera 70% del target.",
    suggestion: "Mantene cadencia y elimina bloqueos",
    risk: "low",
  };
}

export function computeOkrInsights(
  krs: Array<{ id: string }>,
  krInsights: Array<{ krId: string; risk: KrRisk }>
): OkrInsightsOutput {
  if (!krs.length) {
    return {
      explanationShort: "Sin KRs",
      explanationLong: "Este OKR no tiene KRs asociados.",
      suggestion: "Agrega 1-3 KRs medibles",
    };
  }

  const riskByKrId = new Map<string, KrRisk>(
    krInsights.map((i) => [i.krId, i.risk])
  );

  let low = 0;
  let medium = 0;
  let high = 0;

  for (const kr of krs) {
    const risk = riskByKrId.get(kr.id);
    if (risk === "high") high++;
    else if (risk === "medium") medium++;
    else if (risk === "low") low++;
  }

  if (high > 0) {
    return {
      explanationShort: "OKR en riesgo por KR criticos",
      explanationLong:
        "Hay KRs en estado critico que estan afectando el estado general del OKR.",
      suggestion: "Prioriza KRs criticos y defini iniciativas",
    };
  }

  if (medium > krs.length / 2) {
    return {
      explanationShort: "OKR en riesgo",
      explanationLong: "La mayoria de los KRs estan en riesgo.",
      suggestion: "Revisa el ritmo y las acciones de soporte",
    };
  }

  return {
    explanationShort: "OKR en rumbo",
    explanationLong: "La mayoria de los KRs estan en buen estado.",
    suggestion: "Mantener foco y cadencia",
  };
}
