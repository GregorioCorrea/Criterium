import { useState } from "react";
import { apiPost } from "../api";
import AiStatus from "./AiStatus";
import Modal from "./Modal";

type DraftResponse = {
  objectiveRefined: string | null;
  questions: string[];
  suggestedKrs: Array<{
    title: string;
    metricName: string | null;
    unit: string | null;
    targetValue: number;
  }>;
  warnings?: string[];
};

type Issue = {
  severity: "high" | "medium" | "low";
  code: string;
  message: string;
  fixSuggestion?: string;
};

type ValidateResponse = {
  issues: Issue[];
  score?: number;
  source?: string;
};

type KrDraft = {
  title: string;
  metricName: string;
  unit: string;
  targetValue: string;
};

type Props = {
  onClose: () => void;
  onCreated: (okrId: string) => void;
};

function formatApiError(message: string): string {
  const raw = message.replace(/^API \d+:\s*/i, "");
  try {
    const parsed = JSON.parse(raw);
    const code = parsed?.error;
    switch (code) {
      case "missing_fields":
        return "Completá todos los campos obligatorios.";
      case "ai_unavailable":
        return "La IA no está disponible ahora. Probá en unos minutos.";
      case "ai_validation_failed":
        return "Hay issues que bloquean la creación. Revisá las sugerencias.";
      case "kr_target_missing":
        return "Cada KR necesita un target numérico.";
      default:
        return parsed?.message || raw;
    }
  } catch {
    return raw;
  }
}

export default function NewOkrModal({ onClose, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [objective, setObjective] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [context, setContext] = useState("");
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [krs, setKrs] = useState<KrDraft[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>(["", "", ""]);
  const [proposalCount, setProposalCount] = useState(0);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  const dirty =
    objective.trim().length > 0 ||
    fromDate.trim().length > 0 ||
    toDate.trim().length > 0 ||
    context.trim().length > 0 ||
    krs.some((k) => k.title || k.metricName || k.unit || k.targetValue);

  const handleDraft = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await apiPost<DraftResponse>("/ai/okr/draft", {
        objective,
        fromDate,
        toDate,
        context,
        existingKrTitles: krs.map((k) => k.title).filter(Boolean),
        answers,
      });
      if (res.warnings?.includes("ai_unavailable") || res.suggestedKrs.length === 0) {
        setErr("La IA no pudo generar KRs. Probá nuevamente en unos minutos.");
        setDraft(res);
        setQuestions(res.questions ?? []);
        return;
      }
      setDraft(res);
      setQuestions(res.questions ?? []);
      const incoming = res.suggestedKrs.map((kr) => ({
        title: kr.title,
        metricName: kr.metricName ?? "",
        unit: kr.unit ?? "",
        targetValue: String(kr.targetValue ?? ""),
      }));
      setKrs((prev) => {
        if (step === 1 || prev.length === 0) return incoming;
        const existingTitles = new Set(prev.map((k) => k.title.toLowerCase()));
        const filtered = incoming.filter((k) => !existingTitles.has(k.title.toLowerCase()));
        return [...prev, ...filtered];
      });
      if (res.suggestedKrs.length > 0) {
        setProposalCount((c) => Math.min(c + 1, 3));
      }
      setStep(2);
    } catch (e: any) {
      setErr(formatApiError(e.message));
    } finally {
      setBusy(false);
    }
  };

  const handleValidate = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await apiPost<ValidateResponse>("/ai/okr/validate", {
        objective,
        fromDate,
        toDate,
        krs: krs.map((kr) => ({
          title: kr.title,
          metricName: kr.metricName || null,
          unit: kr.unit || null,
          targetValue: Number(kr.targetValue),
        })),
      });
      setIssues(res.issues || []);
      setNotes([]);
      setStep(3);
    } catch (e: any) {
      setErr(formatApiError(e.message));
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await apiPost<{ okr: { id: string } }>("/okrs/with-krs", {
        objective,
        fromDate,
        toDate,
        krs: krs.map((kr) => ({
          title: kr.title,
          metricName: kr.metricName || null,
          unit: kr.unit || null,
          targetValue: Number(kr.targetValue),
        })),
      });
      onCreated(res.okr.id);
    } catch (e: any) {
      setErr(formatApiError(e.message));
    } finally {
      setBusy(false);
    }
  };

  const hasHigh = issues.some((i) => i.severity === "high");
  const canProposeMore = proposalCount < 3;
  const hasKrs = krs.length > 0;

  return (
    <Modal title="Nuevo OKR" onClose={onClose} dirty={dirty}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div />
        <AiStatus />
      </div>
      {err && <pre style={{ color: "crimson" }}>{err}</pre>}

      {step === 1 && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ padding: 8, border: "1px solid #2a3440", borderRadius: 8 }}>
            La IA va a sugerir KRs y validar que sean medibles. Luego podés editar.
          </div>
          <label>
            Objetivo
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={3}
              style={{ width: "100%" }}
            />
          </label>
          <label>
            Desde
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          <label>
            Contexto (opcional)
            <input value={context} onChange={(e) => setContext(e.target.value)} />
          </label>
          <button disabled={busy} onClick={handleDraft}>
            {busy ? "Analizando..." : "Continuar y sugerir KRs"}
          </button>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ padding: 8, border: "1px solid #2a3440", borderRadius: 8 }}>
            <div>
              <b>Objetivo:</b> {objective || "-"}
            </div>
            <div>
              <b>Fechas:</b> {fromDate || "-"} → {toDate || "-"}
            </div>
          </div>
          {draft?.objectiveRefined && (
            <div style={{ padding: 8, border: "1px solid #2a3440", borderRadius: 8 }}>
              <b>Sugerencia de objetivo:</b> {draft.objectiveRefined}{" "}
              <button
                onClick={() => setObjective(draft.objectiveRefined || objective)}
                style={{ marginLeft: 8 }}
              >
                Usar
              </button>
            </div>
          )}

          <h3>KRs propuestos</h3>
          {draft?.warnings?.length ? (
            <div style={{ color: "#a6adbb" }}>
              {draft.warnings
                .map((w) => (w === "ai_unavailable" ? "IA no disponible" : w))
                .join(" • ")}
            </div>
          ) : null}
          {questions.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 600 }}>Preguntas para ajustar contexto</div>
              {questions.map((q, idx) => (
                <label key={idx}>
                  {q}
                  <input
                    value={answers[idx] ?? ""}
                    onChange={(e) => {
                      const next = [...answers];
                      next[idx] = e.target.value;
                      setAnswers(next);
                    }}
                  />
                </label>
              ))}
            </div>
          )}
          {krs.length === 0 && (
            <div style={{ color: "#a6adbb" }}>
              No se generaron KRs. Agregalos manualmente.
            </div>
          )}
          {krs.map((kr, idx) => (
            <div
              key={idx}
              style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr 1fr 1fr" }}
            >
              <input
                placeholder="Titulo"
                value={kr.title}
                onChange={(e) => {
                  const next = [...krs];
                  next[idx].title = e.target.value;
                  setKrs(next);
                }}
              />
              <input
                placeholder="Metrica"
                value={kr.metricName}
                onChange={(e) => {
                  const next = [...krs];
                  next[idx].metricName = e.target.value;
                  setKrs(next);
                }}
              />
              <input
                placeholder="Unidad"
                value={kr.unit}
                onChange={(e) => {
                  const next = [...krs];
                  next[idx].unit = e.target.value;
                  setKrs(next);
                }}
              />
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  placeholder="Target"
                  value={kr.targetValue}
                  onChange={(e) => {
                    const next = [...krs];
                    next[idx].targetValue = e.target.value;
                    setKrs(next);
                  }}
                />
                <button
                  title="Eliminar"
                  onClick={() => {
                    const next = [...krs];
                    next.splice(idx, 1);
                    setKrs(next);
                  }}
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
          <div>
            <button
              onClick={() =>
                setKrs([...krs, { title: "", metricName: "", unit: "", targetValue: "" }])
              }
            >
              Agregar KR
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep(1)}>Volver</button>
            {canProposeMore && (
              <button disabled={busy} onClick={handleDraft}>
                {busy ? "Analizando..." : hasKrs ? "Proponer otros KR" : "Proponer KR"}
              </button>
            )}
            <button disabled={busy} onClick={handleValidate}>
              {busy ? "Validando..." : "Validar con IA"}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ padding: 8, border: "1px solid #2a3440", borderRadius: 8 }}>
            <div>
              <b>Objetivo:</b> {objective || "-"}
            </div>
            <div>
              <b>Fechas:</b> {fromDate || "-"} → {toDate || "-"}
            </div>
          </div>
          <h3>Validacion</h3>
          {issues.length === 0 && <div>Sin issues.</div>}
          {issues.map((i, idx) => (
            <div key={idx} style={{ border: "1px solid #2a3440", padding: 8, borderRadius: 8 }}>
              <b>{i.severity.toUpperCase()}</b> - {i.message}
              {i.fixSuggestion && <div>Recomendacion: {i.fixSuggestion}</div>}
            </div>
          ))}
          {notes.length > 0 && (
            <div style={{ color: "#a6adbb" }}>{notes.join(" • ")}</div>
          )}
          {hasHigh && <div style={{ color: "#f5b4b4" }}>Corregí los issues high para continuar.</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep(2)}>Volver</button>
            {hasHigh && (
              <button
                disabled={busy}
                onClick={async () => {
                  setErr(null);
                  setBusy(true);
                  try {
                    const fix = await apiPost<{ correctedKrs: DraftResponse["suggestedKrs"]; notes?: string[] }>(
                      "/ai/okr/fix",
                      {
                        objective,
                        fromDate,
                        toDate,
                        krs: krs.map((kr) => ({
                          title: kr.title,
                          metricName: kr.metricName || null,
                          unit: kr.unit || null,
                          targetValue: Number(kr.targetValue),
                        })),
                        issues,
                      }
                    );
                    if (fix.correctedKrs?.length) {
                      setKrs(
                        fix.correctedKrs.map((kr) => ({
                          title: kr.title,
                          metricName: kr.metricName ?? "",
                          unit: kr.unit ?? "",
                          targetValue: String(kr.targetValue ?? ""),
                        }))
                      );
                      setNotes(fix.notes ?? []);
                      setStep(2);
                    }
                  } catch (e: any) {
                    setErr(formatApiError(e.message));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Corregir issues high
              </button>
            )}
            <button disabled={busy || hasHigh} onClick={handleCreate}>
              {busy ? "Creando..." : "Crear OKR"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
