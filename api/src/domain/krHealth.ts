export type KrHealth = "no_target" | "no_checkins" | "off_track" | "at_risk" | "on_track";

export function computeProgressPct(currentValue: number | null, targetValue: number | null): number | null {
  if (targetValue === null || targetValue === undefined) return null;
  if (targetValue <= 0) return null;
  if (currentValue === null || currentValue === undefined) return 0;
  return Math.max(0, Math.min(100, (currentValue / targetValue) * 100));
}

export function computeHealth(currentValue: number | null, targetValue: number | null): KrHealth {
  if (targetValue === null || targetValue === undefined || targetValue <= 0) return "no_target";
  if (currentValue === null || currentValue === undefined) return "no_checkins";

  const pct = computeProgressPct(currentValue, targetValue) ?? 0;

  if (pct < 40) return "off_track";
  if (pct < 70) return "at_risk";
  return "on_track";
}
