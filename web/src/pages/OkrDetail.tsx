import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiDelete, apiGet, apiPost } from "../api";
import AiStatus from "../components/AiStatus";
import Modal from "../components/Modal";

type Kr = {
  id: string;
  title: string;
  metricName: string | null;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  progressPct: number | null;
  health: string;
  insights?: {
    explanationShort: string;
    explanationLong?: string;
    suggestion: string;
    risk: string | null;
    computedAt: string;
    source: string;
  } | null;
};

type OkrDetail = {
  id: string;
  objective: string;
  fromDate: string;
  toDate: string;
  status: string;
  summary: {
    krCount: number;
    avgProgressPct: number | null;
    overallHealth: string;
    healthCounts: Record<string, number>;
  };
  insights?: {
    explanationShort: string;
    explanationLong?: string;
    suggestion: string;
    computedAt: string;
    source: string;
  } | null;
  krs: Kr[];
};

type AiDraftResponse = {
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

function formatHealth(value: string | null | undefined): string {
  switch (value) {
    case "no_target":
      return "sin target";
    case "no_checkins":
      return "sin avances";
    case "off_track":
      return "fuera de rumbo";
    case "at_risk":
      return "en riesgo";
    case "on_track":
      return "en rumbo";
    default:
      return value || "-";
  }
}

export default function OkrDetail() {
  const { okrId } = useParams();
  const [data, setData] = useState<OkrDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [krForm, setKrForm] = useState({
    title: "",
    metricName: "",
    unit: "",
    targetValue: "",
  });
  const [krIssues, setKrIssues] = useState<{ severity: string; message: string; fixSuggestion?: string }[]>(
    []
  );
  const [checkinForm, setCheckinForm] = useState({
    krId: "",
    value: "",
    comment: "",
  });
  const [showKrModal, setShowKrModal] = useState(false);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [showAiKrModal, setShowAiKrModal] = useState(false);
  const [aiContext, setAiContext] = useState("");
  const [aiDraft, setAiDraft] = useState<AiDraftResponse | null>(null);
  const [aiQuestions, setAiQuestions] = useState<string[]>([]);
  const [aiAnswers, setAiAnswers] = useState<string[]>(["", "", ""]);
  const [aiBusy, setAiBusy] = useState(false);
  const aiHasGaps = aiQuestions.some((_, idx) => !aiAnswers[idx]?.trim());
  const aiReadyForSuggestions = aiQuestions.length === 0 || !aiHasGaps;

  const krDirty =
    krForm.title.trim().length > 0 ||
    krForm.metricName.trim().length > 0 ||
    krForm.unit.trim().length > 0 ||
    krForm.targetValue.trim().length > 0;
  const checkinDirty =
    checkinForm.krId.trim().length > 0 ||
    checkinForm.value.trim().length > 0 ||
    checkinForm.comment.trim().length > 0;

  const formatApiError = (message: string): string => {
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
          return "El targetValue es obligatorio.";
        case "okr_not_found":
          return "No se encontró el OKR.";
        case "kr_not_found":
          return "No se encontró el KR.";
        default:
          return parsed?.message || raw;
      }
    } catch {
      return raw;
    }
  };

  const load = () => {
    if (!okrId) return;
    apiGet<OkrDetail>(`/okrs/${okrId}`)
      .then(setData)
      .catch((e) => setErr(formatApiError(e.message)));
  };

  useEffect(() => {
    load();
  }, [okrId]);

  if (err) return <pre style={{ padding: 16 }}>{err}</pre>;
  if (!data) return <div style={{ padding: 16 }}>Cargando.</div>;

  const selectableKrs = data.krs.filter(
    (kr) => kr.progressPct === null || kr.progressPct < 100
  );

  const handleDeleteOkr = async () => {
    if (!okrId) return;
    try {
      const info = await apiGet<{ okrId: string; krCount: number; checkinsCount: number }>(
        `/okrs/${okrId}/delete-info`
      );
      const message = [
        "Vas a borrar este OKR.",
        info.krCount > 0 ? `Incluye ${info.krCount} KR(s).` : "No tiene KRs.",
        info.checkinsCount > 0
          ? `Se eliminaran ${info.checkinsCount} check-in(s).`
          : "No hay check-ins asociados.",
        "Esta accion no se puede deshacer. Continuar?",
      ].join(" ");
      const ok = window.confirm(message);
      if (!ok) return;
      await apiDelete<{ ok: boolean }>(`/okrs/${okrId}`);
      window.location.href = "/";
    } catch (e: any) {
      setErr(formatApiError(e.message));
    }
  };

  const handleDeleteKr = async (krId: string) => {
    try {
      const info = await apiGet<{ krId: string; checkinsCount: number }>(
        `/krs/${krId}/delete-info`
      );
      const message = [
        "Vas a borrar este KR.",
        info.checkinsCount > 0
          ? `Se eliminaran ${info.checkinsCount} check-in(s).`
          : "No hay check-ins asociados.",
        "Esta accion no se puede deshacer. Continuar?",
      ].join(" ");
      const ok = window.confirm(message);
      if (!ok) return;
      await apiDelete<{ ok: boolean }>(`/krs/${krId}`);
      load();
    } catch (e: any) {
      setErr(formatApiError(e.message));
    }
  };

  const handleAiDraft = async () => {
    setErr(null);
    setAiBusy(true);
    try {
      const res = await apiPost<AiDraftResponse>("/ai/okr/draft", {
        objective: data.objective,
        fromDate: data.fromDate,
        toDate: data.toDate,
        context: aiContext,
        existingKrTitles: data.krs.map((kr) => kr.title),
        answers: aiAnswers,
      });
      if ((res.questions?.length ?? 0) > 0 && aiAnswers.every((a) => !a.trim())) {
        setAiQuestions(res.questions ?? []);
        setAiDraft({ ...res, suggestedKrs: [] });
        setAiAnswers((prev) => {
          const next = [...prev];
          while (next.length < res.questions.length) next.push("");
          return next.slice(0, res.questions.length);
        });
        return;
      }
      setAiDraft(res);
      setAiQuestions(res.questions ?? []);
      if (res.questions?.length) {
        setAiAnswers((prev) => {
          const next = [...prev];
          while (next.length < res.questions.length) next.push("");
          return next.slice(0, res.questions.length);
        });
      }
    } catch (e: any) {
      setErr(formatApiError(e.message));
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-content">
        <div style={{ marginBottom: 12 }}>
          <Link to="/">{"<"} Volver</Link>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2>{data.objective}</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <AiStatus />
            <button onClick={handleDeleteOkr}>Eliminar OKR</button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div>
            <b>Fechas:</b> {data.fromDate} - {data.toDate}
          </div>
          <div>
            <b>Status:</b> {data.status}
          </div>
          <div>
            <b>Estado:</b> {formatHealth(data.summary?.overallHealth)}
          </div>
          <div>
            <b>Progreso promedio:</b> {data.summary?.avgProgressPct ?? "-"}%
          </div>
          <div>
            <b>KRs:</b> {data.summary?.krCount ?? 0}
          </div>
        </div>

        <div style={{ marginBottom: 16, padding: 12, border: "1px solid var(--border)" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Estado y recomendacion</div>
          <div>
            {data.insights?.explanationLong ??
              data.insights?.explanationShort ??
              "Sin informacion"}
          </div>
          <div>
            <b>Siguiente:</b> {data.insights?.suggestion ?? "-"}
          </div>
        </div>

        <h3>Key Results</h3>
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>Titulo</th>
            <th>Metrica</th>
            <th>Actual</th>
            <th>Target</th>
            <th>Progreso</th>
            <th>Estado</th>
            <th>Estado y recomendacion</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {data.krs.map((kr) => (
            <tr key={kr.id} style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
              <td>{kr.title}</td>
              <td>{kr.metricName ?? "-"}</td>
              <td>{kr.currentValue ?? "-"}</td>
              <td>
                {kr.targetValue ?? "-"} {kr.unit ?? ""}
              </td>
              <td>{kr.progressPct === null ? "-" : `${Math.round(kr.progressPct)}%`}</td>
              <td>{formatHealth(kr.health)}</td>
              <td>
                <div>
                  {kr.insights?.explanationLong ??
                    kr.insights?.explanationShort ??
                    "Sin informacion"}
                </div>
                <div>
                  <b>Siguiente:</b> {kr.insights?.suggestion ?? "-"}
                </div>
              </td>
              <td>
                <button onClick={() => handleDeleteKr(kr.id)}>Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

        <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
          <button onClick={() => setShowKrModal(true)}>Agregar KR</button>
          <button onClick={() => setShowAiKrModal(true)}>Proponer KRs con IA</button>
          <button onClick={() => setShowCheckinModal(true)}>Registrar check-in</button>
        </div>

        {showKrModal && (
          <Modal title="Agregar KR" onClose={() => setShowKrModal(false)} dirty={krDirty}>
            {krIssues.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {krIssues.map((i, idx) => (
                  <div key={idx}>
                    <b>{i.severity.toUpperCase()}</b> {i.message}
                    {i.fixSuggestion ? ` (${i.fixSuggestion})` : ""}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
              <input
                placeholder="Titulo"
                value={krForm.title}
                onChange={(e) => setKrForm({ ...krForm, title: e.target.value })}
              />
              <input
                placeholder="Metrica"
                value={krForm.metricName}
                onChange={(e) => setKrForm({ ...krForm, metricName: e.target.value })}
              />
              <input
                placeholder="Unidad"
                value={krForm.unit}
                onChange={(e) => setKrForm({ ...krForm, unit: e.target.value })}
              />
              <input
                placeholder="Target"
                value={krForm.targetValue}
                onChange={(e) => setKrForm({ ...krForm, targetValue: e.target.value })}
              />
            </div>
            <button
              disabled={busy}
              onClick={async () => {
                if (!okrId) return;
                setBusy(true);
                setKrIssues([]);
                try {
                  const validation = await apiPost<{ issues: any[]; suggestedTargetValue?: number }>(
                    "/ai/kr/validate",
                    {
                      title: krForm.title,
                      metricName: krForm.metricName || null,
                      unit: krForm.unit || null,
                      targetValue: krForm.targetValue ? Number(krForm.targetValue) : null,
                    }
                  );
                  setKrIssues(validation.issues || []);
                  const hasHigh = (validation.issues || []).some((i) => i.severity === "high");
                  if (hasHigh) {
                    setBusy(false);
                    return;
                  }
                  await apiPost(`/krs`, {
                    okrId,
                    title: krForm.title,
                    metricName: krForm.metricName || null,
                    unit: krForm.unit || null,
                    targetValue: Number(krForm.targetValue),
                  });
                  setKrForm({ title: "", metricName: "", unit: "", targetValue: "" });
                  setShowKrModal(false);
                  load();
                } catch (e: any) {
                  setErr(formatApiError(e.message));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Guardando..." : "Guardar KR"}
            </button>
          </Modal>
        )}

        {showAiKrModal && (
          <Modal title="Proponer KRs con IA" onClose={() => setShowAiKrModal(false)} dirty={aiBusy}>
            <div style={{ display: "grid", gap: 8 }}>
              <div>
                <b>Objetivo:</b> {data.objective}
              </div>
              <div>
                <b>Fechas:</b> {data.fromDate} - {data.toDate}
              </div>
              <label>
                Contexto (opcional)
                <input value={aiContext} onChange={(e) => setAiContext(e.target.value)} />
              </label>
              {aiQuestions.length > 0 && (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontWeight: 600 }}>Preguntas para ajustar contexto</div>
                  {aiQuestions.map((q, idx) => (
                    <label key={idx}>
                      {q}
                      <input
                        value={aiAnswers[idx] ?? ""}
                        onChange={(e) => {
                          const next = [...aiAnswers];
                          next[idx] = e.target.value;
                          setAiAnswers(next);
                        }}
                      />
                    </label>
                  ))}
                </div>
              )}
              {aiDraft?.warnings?.length ? (
                <div style={{ color: "#a6adbb" }}>{aiDraft.warnings.join(" - ")}</div>
              ) : null}
              <button
                disabled={aiBusy}
                onClick={() => {
                  if (!aiReadyForSuggestions) {
                    setErr("Responde las preguntas para continuar con la propuesta.");
                    return;
                  }
                  handleAiDraft();
                }}
              >
                {aiBusy ? "Analizando..." : aiQuestions.length > 0 ? "Proponer KRs" : "Generar preguntas"}
              </button>
              {aiDraft?.suggestedKrs?.length ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {aiDraft.suggestedKrs.map((kr, idx) => (
                    <div
                      key={idx}
                      style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr 1fr 1fr auto" }}
                    >
                      <input value={kr.title} readOnly />
                      <input value={kr.metricName ?? ""} readOnly />
                      <input value={kr.unit ?? ""} readOnly />
                      <input value={String(kr.targetValue ?? "")} readOnly />
                      <button
                        onClick={async () => {
                          if (!okrId) return;
                          try {
                            await apiPost(`/krs`, {
                              okrId,
                              title: kr.title,
                              metricName: kr.metricName ?? null,
                              unit: kr.unit ?? null,
                              targetValue: kr.targetValue,
                            });
                            setAiDraft((prev) => {
                              if (!prev) return prev;
                              const next = [...prev.suggestedKrs];
                              next.splice(idx, 1);
                              return { ...prev, suggestedKrs: next };
                            });
                            load();
                          } catch (e: any) {
                            setErr(formatApiError(e.message));
                          }
                        }}
                      >
                        Agregar
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </Modal>
        )}

        {showCheckinModal && (
          <Modal title="Registrar check-in" onClose={() => setShowCheckinModal(false)} dirty={checkinDirty}>
            {selectableKrs.length === 0 && (
              <div style={{ color: "#a6adbb", marginBottom: 8 }}>
                Todos los KRs ya alcanzaron el 100%. No se pueden registrar mas avances.
              </div>
            )}
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr 2fr" }}>
              <select
                value={checkinForm.krId}
                onChange={(e) => setCheckinForm({ ...checkinForm, krId: e.target.value })}
              >
                <option value="">Elegi un KR</option>
                {selectableKrs.map((kr) => (
                  <option key={kr.id} value={kr.id}>
                    {kr.title}
                  </option>
                ))}
              </select>
              <input
                placeholder="Valor actual"
                value={checkinForm.value}
                onChange={(e) => setCheckinForm({ ...checkinForm, value: e.target.value })}
              />
              <input
                placeholder="Comentario (opcional)"
                value={checkinForm.comment}
                onChange={(e) => setCheckinForm({ ...checkinForm, comment: e.target.value })}
              />
            </div>
            <button
              disabled={busy || selectableKrs.length === 0}
              onClick={async () => {
                if (!checkinForm.krId) return;
                setBusy(true);
                try {
                  await apiPost(`/krs/${checkinForm.krId}/checkins`, {
                    value: Number(checkinForm.value),
                    comment: checkinForm.comment || null,
                  });
                  setCheckinForm({ krId: "", value: "", comment: "" });
                  setShowCheckinModal(false);
                  load();
                } catch (e: any) {
                  setErr(formatApiError(e.message));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Registrando..." : "Guardar check-in"}
            </button>
          </Modal>
        )}
      </div>
    </div>
  );
}
