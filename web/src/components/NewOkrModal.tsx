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
  const [lastValidationCacheKey, setLastValidationCacheKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [fixingIssue, setFixingIssue] = useState<string | null>(null);
  const [lockedObjective, setLockedObjective] = useState(false);
  const [lockedDates, setLockedDates] = useState(false);
  const [resolvedIssueCodes, setResolvedIssueCodes] = useState<string[]>([]);

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
  const validationCacheKey = JSON.stringify({
    validationKey,
    lockedObjective,
    lockedDates,
    resolvedIssueCodes,
  });
  const validationStale = lastValidationKey !== null && lastValidationKey !== validationKey;

  const handleDraft = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await apiPost<DraftResponse>("/ai/okr/draft", draftPayload());
      const needsQuestions =
        (res.questions?.length ?? 0) > 0 && answers.every((a) => !a.trim());
      const noSuggestions = res.suggestedKrs.length === 0;
      if (res.warnings?.includes("ai_unavailable")) {
        setErr("La IA no esta disponible ahora. Proba nuevamente en unos minutos.");
      }
      if (noSuggestions && !res.questions?.length) {
        setErr("La IA no genero KRs. Podes agregarlos manualmente o volver a intentar.");
      }
      setDraft(res);
      setQuestions(res.questions ?? []);
      if (needsQuestions) {
        setAnswers((prev) => {
          const next = [...prev];
          while (next.length < (res.questions?.length ?? 0)) next.push("");
          return next.slice(0, res.questions?.length ?? 0);
        });
        return;
      }
      const incoming = res.suggestedKrs.map((kr) => ({
        title: kr.title,
        metricName: kr.metricName ?? "",
        unit: kr.unit ?? "",
        targetValue: String(kr.targetValue ?? ""),
      }));
      setKrs((prev) => {
        if (prev.length === 0) return incoming;
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
    } catch (e: any) {
      setErr(formatApiError(e.message));
    } finally {
      setBusy(false);
    }
  };

  const handleValidate = async () => {
    setErr(null);
    if (lastValidationCacheKey && lastValidationCacheKey === validationCacheKey) {
      return;
    }
    setBusy(true);
    try {
      console.log("[okr] validate request", {
        key: validationKey,
        lockedObjective,
        lockedDates,
        resolvedIssueCodes: resolvedIssueCodes.length,
      });
      const res = await apiPost<ValidateResponse>("/ai/okr/validate", {
        objective,
        fromDate,
        toDate,
        krs: krPayload(),
        lockedObjective,
        lockedDates,
        resolvedIssueCodes,
      });
      const filteredIssues = (res.issues || []).filter(
        (i) => !resolvedIssueCodes.includes(i.code)
      );
      setIssues(filteredIssues);
      setNotes([]);
      setLastValidationKey(validationKey);
      setLastValidationFingerprint(res.fingerprint ?? null);
      setLastValidationCacheKey(validationCacheKey);
      console.log("[okr] validate response", {
        issues: filteredIssues.length,
        fingerprint: res.fingerprint ?? null,
      });
    } catch (e: any) {
      setErr(formatApiError(e.message));
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (allowHigh?: boolean) => {
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
      console.log("[okr] create request", {
        fingerprint: lastValidationFingerprint,
        allowHigh: !!allowHigh,
      });
      const res = await apiPost<{ okr: { id: string } }>("/okrs/with-krs", {
        objective,
        fromDate,
        toDate,
        krs: krPayload(),
        validation: {
          fingerprint: lastValidationFingerprint,
          issues,
        },
        allowHigh: !!allowHigh,
      });
      console.log("[okr] create response", { okrId: res.okr.id });
      onCreated(res.okr.id);
    } catch (e: any) {
      setErr(formatApiError(e.message));
    } finally {
      setBusy(false);
    }
  };

  const handleFixIssues = async (selectedIssues: Issue[]) => {
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
        setLockedObjective(true);
        applied = true;
      }
      if (fix.fromDate) {
        setFromDate(fix.fromDate);
        setLockedDates(true);
        applied = true;
      }
      if (fix.toDate) {
        setToDate(fix.toDate);
        setLockedDates(true);
        applied = true;
      }
      if (fix.notes?.length) {
        setNotes(fix.notes);
      }
      if (applied) {
        setResolvedIssueCodes((prev) =>
          Array.from(new Set([...prev, ...selectedIssues.map((i) => i.code).filter(Boolean)]))
        );
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
          Objetivo{" "}
          {lockedObjective && (
            <span
              style={{
                marginLeft: 8,
                padding: "2px 6px",
                borderRadius: 999,
                fontSize: 12,
                background: "rgba(120, 140, 170, 0.2)",
                color: "#a6adbb",
              }}
            >
              Bloqueado por IA
            </span>
          )}
          <textarea
            value={objective}
            onChange={(e) => {
              setObjective(e.target.value);
              if (lockedObjective) {
                setLockedObjective(false);
                setResolvedIssueCodes([]);
              }
            }}
            rows={2}
            style={{ width: "100%" }}
          />
        </label>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label>
            Desde{" "}
            {lockedDates && (
              <span
                style={{
                  marginLeft: 8,
                  padding: "2px 6px",
                  borderRadius: 999,
                  fontSize: 12,
                  background: "rgba(120, 140, 170, 0.2)",
                  color: "#a6adbb",
                }}
              >
                Bloqueado por IA
              </span>
            )}
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                if (lockedDates) {
                  setLockedDates(false);
                  setResolvedIssueCodes([]);
                }
              }}
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                if (lockedDates) {
                  setLockedDates(false);
                  setResolvedIssueCodes([]);
                }
              }}
            />
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

      <div style={{ display: "grid", gap: 16, paddingBottom: 64 }}>
        <div style={{ padding: 8, border: "1px solid #2a3440", borderRadius: 8 }}>
          La IA puede sugerir KRs y validar que sean medibles. Luego podes editar.
        </div>
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

        <details open>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Propuesta IA</summary>
          <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
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
                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    gridTemplateColumns: "1.5fr 1fr",
                    fontWeight: 600,
                    color: "var(--muted)",
                  }}
                >
                  <div>Pregunta</div>
                  <div>Respuesta</div>
                </div>
                {questions.map((q, idx) => (
                  <div
                    key={idx}
                    style={{ display: "grid", gap: 8, gridTemplateColumns: "1.5fr 1fr" }}
                  >
                    <div>{q}</div>
                    <input
                      value={answers[idx] ?? ""}
                      onChange={(e) => {
                        const next = [...answers];
                        next[idx] = e.target.value;
                        setAnswers(next);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
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
                  {busy
                    ? "Analizando..."
                    : questions.length > 0
                      ? hasKrs
                        ? "Proponer otros KR"
                        : "Proponer KR"
                      : "Generar preguntas"}
                </button>
              )}
              <button disabled={busy} onClick={handleValidate}>
                {busy ? "Validando..." : "Validar con IA"}
              </button>
            </div>
          </div>
        </details>

        <details open>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>KRs propuestos y actuales</summary>
          <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
            {krs.length === 0 && (
              <div style={{ color: "#a6adbb" }}>
                No hay KRs cargados. Agrega al menos uno para validar.
              </div>
            )}
            <div
              style={{
                display: "grid",
                gap: 8,
                gridTemplateColumns: "2fr 1fr 1fr 1fr auto",
                fontWeight: 600,
                color: "var(--muted)",
              }}
            >
              <div>Titulo</div>
              <div>Metrica</div>
              <div>Unidad</div>
              <div>Target</div>
              <div>Acciones</div>
            </div>
            {krs.map((kr, idx) => (
              <div
                key={idx}
                style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr 1fr 1fr auto" }}
              >
                <input
                  value={kr.title}
                  onChange={(e) => {
                    const next = [...krs];
                    next[idx].title = e.target.value;
                    setKrs(next);
                  }}
                />
                <input
                  value={kr.metricName}
                  onChange={(e) => {
                    const next = [...krs];
                    next[idx].metricName = e.target.value;
                    setKrs(next);
                  }}
                />
                <input
                  value={kr.unit}
                  onChange={(e) => {
                    const next = [...krs];
                    next[idx].unit = e.target.value;
                    setKrs(next);
                  }}
                />
                <input
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
          </div>
        </details>

        <details open>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Validación</summary>
          <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
            {validationStale && (
              <div style={{ color: "#f5b4b4" }}>Cambios realizados, es necesario revalidar.</div>
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
                        await handleFixIssues([i]);
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
          </div>
        </details>
      </div>
      <div className="sticky-actions">
        {hasHigh && (
          <button
            disabled={busy}
            onClick={() => handleFixIssues(issues.filter((i) => i.severity === "high"))}
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
            handleCreate(hasHigh);
          }}
        >
          {busy ? "Creando..." : "Crear OKR"}
        </button>
      </div>
    </Modal>
  );
}
