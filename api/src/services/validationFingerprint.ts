import crypto from "node:crypto";

type KrInput = {
  title: string;
  metricName?: string | null;
  unit?: string | null;
  targetValue: number | null;
};

type OkrInput = {
  objective: string;
  fromDate: string;
  toDate: string;
  krs: KrInput[];
};

function normalizeKr(kr: KrInput) {
  return {
    title: String(kr.title ?? "").trim(),
    metricName: kr.metricName ? String(kr.metricName) : null,
    unit: kr.unit ? String(kr.unit) : null,
    targetValue:
      kr.targetValue === null || kr.targetValue === undefined
        ? null
        : Number(kr.targetValue),
  };
}

export function computeOkrFingerprint(input: OkrInput): string {
  const payload = {
    objective: String(input.objective ?? "").trim(),
    fromDate: String(input.fromDate ?? ""),
    toDate: String(input.toDate ?? ""),
    krs: input.krs.map(normalizeKr),
  };
  const serialized = JSON.stringify(payload);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}
