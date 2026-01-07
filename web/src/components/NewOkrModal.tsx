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
  fingerprint?: string;
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
        return "Completa todos los campos obligatorios.";
      case "ai_unavailable":
        return "La IA no esta disponible ahora. Proba en unos minutos.";
      case "ai_validation_failed":
        return "Hay issues que bloquean la creacion. Revisa las sugerencias.";
      case "kr_target_missing":
        return "Cada KR necesita un target numerico.";
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
  const [lastValidationKey, setLastValidationKey] = useState<string | null>(null);
  const [lastValidationFingerprint, setLastValidationFingerprint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [fixingIssue, setFixingIssue] = useState<string | null>(null);

  const dirty =
    objective.trim().length > 0 ||
    fromDate.trim().length > 0 ||
    toDate.trim().length > 0 ||
    context.trim().length > 0 ||
    krs.some((k) => k.title || k.metricName || k.unit || k.targetValue);

  const canProposeMore = proposalCount < 3;
  const hasKrs = krs.length > 0;
  const hasHigh = issues.some((i) => i.severity === "high");
  const hasQuestionGaps = questions.some((_, idx) => !answers[idx]?.trim());

  const draftPayload = () => ({
    objective,
    fromDate,
    toDate,
    context,
    existingKrTitles: krs.map((k) => k.title).filter(Boolean),
    answers,
  });

  const krPayload = () =>
    krs.map((kr) => ({
      title: kr.title,
      metricName: kr.metricName || null,
      unit: kr.unit || null,
      targetValue: Number(kr.targetValue),
    }));

  const buildValidationKey = () =>
    JSON.stringify({
      objective: objective.trim(),
      fromDate: fromDate.trim(),
      toDate: toDate.trim(),
      krs: krs.map((kr) => ({
        title: kr.title.trim(),
        metricName: kr.metricName.trim(),
        unit: kr.unit.trim(),
        targetValue: kr.targetValue.trim(),
      })),
    });
  const validationKey = buildValidationKey();
  const validationStale = lastValidationKey !== null && lastValidationKey !== validationKey;

  const handleDraft = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await apiPost<DraftResponse>("/ai/okr/draft", draftPayload());
      const noSuggestions = res.suggestedKrs.length === 0;
      if (res.warnings?.includes("ai_unavailable")) {
        setErr("La IA no esta disponible ahora. Proba nuevamente en unos minutos.");
      }
      if (noSuggestions && !res.questions?.length) {
        setErr("La IA no genero KRs. Podes agregarlos manualmente o volver a intentar.");
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
      if (res.questions?.length) {
        setAnswers((prev) => {
          const next = [...prev];
          while (next.length < res.questions.length) next.push("");
          return next.slice(0, res.questions.length);
        });
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
    if (lastValidationKey && lastValidationKey === validationKey && issues.length >= 0) {
      setStep(3);
      return;
    }
    setBusy(true);
    try {
      console.log("[okr] validate request", { key: validationKey });
      const res = await apiPost<ValidateResponse>("/ai/okr/validate", {
        objective,
        fromDate,
        toDate,
        krs: krPayload(),
      });
      setIssues(res.issues || []);
      setNotes([]);
      setLastValidationKey(validationKey);
      setLastValidationFingerprint(res.fingerprint ?? null);
      console.log("[okr] validate response", {
        issues: res.issues?.length ?? 0,
        fingerprint: res.fingerprint ?? null,
      });
      setStep(3);
    } catch (e: any) {
      setErr(formatApiError(e.message));
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    setErr(null);
    if (!lastValidationKey || lastValidationKey !== validationKey) {
      setErr("Revalida el OKR antes de crear, hubo cambios desde la ultima validacion.");
      return;
    }
    if (!lastValidationFingerprint) {
      setErr("Revalida el OKR antes de crear.");
      return;
    }
    setBusy(true);
    try {
      console.log("[okr] create request", { fingerprint: lastValidationFingerprint });
      const res = await apiPost<{ okr: { id: string } }>("/okrs/with-krs", {
        objective,
        fromDate,
        toDate,
        krs: krPayload(),
        validation: {
          fingerprint: lastValidationFingerprint,
          issues,
        },
      });
      console.log("[okr] create response", { okrId: res.okr.id });
      onCreated(res.okr.id);
    } catch (e: any) {
      setErr(formatApiError(e.message));
    } finally {
      setBusy(false);
    }
  };

  const handleFixIssues = async (selectedIssues: Issue[], returnToStep2: boolean) => {
    setErr(null);
    setBusy(true);
    try {
      const fix = await apiPost<{
        correctedKrs: DraftResponse["suggestedKrs"];
        notes?: string[];
        objectiveRefined?: string | null;
        fromDate?: string | null;
        toDate?: string | null;
      }>(
        "/ai/okr/fix",
        {
          objective,
          fromDate,
          toDate,
          krs: krPayload(),
          issues: selectedIssues,
        }
      );
      let applied = false;
      if (fix.correctedKrs?.length) {
        setKrs(
          fix.correctedKrs.map((kr) => ({
            title: kr.title,
            metricName: kr.metricName ?? "",
            unit: kr.unit ?? "",
            targetValue: String(kr.targetValue ?? ""),
          }))
        );
        applied = true;
      }
      if (fix.objectiveRefined) {
        setObjective(fix.objectiveRefined);
        applied = true;
      }
      if (fix.fromDate) {
        setFromDate(fix.fromDate);
        applied = true;
      }
      if (fix.toDate) {
        setToDate(fix.toDate);
        applied = true;
      }
      if (fix.notes?.length) {
        setNotes(fix.notes);
      }
      if (returnToStep2 && applied) {
        setStep(2);
      }
      if (!applied) {
        setErr("No pude corregir automaticamente. Ajusta manualmente y valida de nuevo.");
      }
    } catch (e: any) {
      setErr(formatApiError(e.message));
    } finally {
      setBusy(false);
    }
  };

  const renderOkrFields = (showContext: boolean) => (
    <div style={{ padding: 8, border: "1px solid #2a3440", borderRadius: 8 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <label>
          Objetivo
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={2}
            style={{ width: "100%" }}
          />
        </label>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label>
            Desde
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
        </div>
        {showContext && (
          <label>
            Contexto (opcional)
            <input value={context} onChange={(e) => setContext(e.target.value)} />
          </label>
        )}
      </div>
    </div>
  );

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
            La IA va a sugerir KRs y validar que sean medibles. Luego podes editar.
          </div>
          {renderOkrFields(true)}
          <button disabled={busy} onClick={handleDraft}>
            {busy ? "Analizando..." : "Continuar y sugerir KRs"}
          </button>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: "grid", gap: 12 }}>
          {renderOkrFields(true)}
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
                .join(" - ")}
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
                  Eliminar
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
              <button
                disabled={busy || (questions.length > 0 && hasQuestionGaps)}
                onClick={() => {
                  if (questions.length > 0 && hasQuestionGaps) {
                    setErr("Responde las preguntas para continuar con la propuesta.");
                    return;
                  }
                  handleDraft();
                }}
              >
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
          {renderOkrFields(false)}
          <h3>Validacion</h3>
          {validationStale && (
            <div style={{ color: "#f5b4b4" }}>
              Cambios realizados, es necesario revalidar.
            </div>
          )}
          {issues.length === 0 && <div>Sin issues.</div>}
          {issues.map((i, idx) => (
            <div key={idx} style={{ border: "1px solid #2a3440", padding: 8, borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <b>{i.severity.toUpperCase()}</b> - {i.message}
                  {i.fixSuggestion && <div>Recomendacion: {i.fixSuggestion}</div>}
                </div>
                <button
                  disabled={busy}
                  onClick={async () => {
                    setFixingIssue(i.code || "issue");
                    setErr(null);
                    try {
                      await handleFixIssues([i], false);
                    } finally {
                      setFixingIssue(null);
                    }
                  }}
                >
                  {fixingIssue === i.code ? "Corrigiendo..." : "Corregir"}
                </button>
              </div>
            </div>
          ))}
          {notes.length > 0 && (
            <div style={{ color: "#a6adbb" }}>Notas IA: {notes.join(" - ")}</div>
          )}
          {hasHigh && (
            <div style={{ color: "#f5b4b4" }}>
              Hay issues high. Podes corregirlos o continuar igual.
            </div>
          )}
          <h3>KRs actuales</h3>
          {krs.length === 0 && (
            <div style={{ color: "#a6adbb" }}>
              No hay KRs cargados. Agrega al menos uno para validar.
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
                  Eliminar
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
            <button onClick={() => setStep(2)}>Volver</button>
            {hasHigh && (
              <button
                disabled={busy}
                onClick={() =>
                  handleFixIssues(
                    issues.filter((i) => i.severity === "high"),
                    true
                  )
                }
              >
                Corregir KRs (IA)
              </button>
            )}
            <button disabled={busy} onClick={handleValidate}>
              {busy ? "Validando..." : "Revalidar"}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                if (hasHigh) {
                  const ok = window.confirm("Hay issues HIGH. Queres crear el OKR igual?");
                  if (!ok) return;
                }
                handleCreate();
              }}
            >
              {busy ? "Creando..." : "Crear OKR"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
