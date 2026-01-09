import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiDelete, apiGet, apiPost } from "../api";
import AiStatus from "../components/AiStatus";

type AlignedOkr = {
  id: string;
  objective: string;
  fromDate: string;
  toDate: string;
  status: string;
};

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
  alignedTo?: AlignedOkr[];
  alignedFrom?: AlignedOkr[];
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

type OkrListItem = {
  id: string;
  objective: string;
  fromDate: string;
  toDate: string;
  status: string;
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

type KrSortKey =
  | "title"
  | "metricName"
  | "currentValue"
  | "targetValue"
  | "progress"
  | "health"
  | "insight";

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
  const [allOkrs, setAllOkrs] = useState<OkrListItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [krSort, setKrSort] = useState<{ key: KrSortKey; dir: "asc" | "desc" } | null>(null);
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
  const [checkinError, setCheckinError] = useState<string | null>(null);
  const checkinValueRef = useRef<HTMLInputElement | null>(null);
  const [aiContext, setAiContext] = useState("");
  const [aiDraft, setAiDraft] = useState<AiDraftResponse | null>(null);
  const [aiQuestions, setAiQuestions] = useState<string[]>([]);
  const [aiAnswers, setAiAnswers] = useState<string[]>(["", "", ""]);
  const [aiBusy, setAiBusy] = useState(false);
  const aiHasGaps = aiQuestions.some((_, idx) => !aiAnswers[idx]?.trim());
  const aiReadyForSuggestions = aiQuestions.length === 0 || !aiHasGaps;
  const [aiAddedTitles, setAiAddedTitles] = useState<string[]>([]);
  const [aiAddError, setAiAddError] = useState<{
    kr: AiDraftResponse["suggestedKrs"][number];
    issues: { severity: string; message: string; fixSuggestion?: string }[];
  } | null>(null);
  const [alignTargetId, setAlignTargetId] = useState("");
  const [alignBusy, setAlignBusy] = useState(false);
  const [alignDirection, setAlignDirection] = useState<"up" | "down">("up");
  const [alignConfirm, setAlignConfirm] = useState<{
    parentOkrId: string;
    childOkrId: string;
    message: string;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "okr" | "kr";
    okrId?: string;
    krId?: string;
    message: string;
  } | null>(null);

  const formatApiError = (message: string): string => {
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
          return "El targetValue es obligatorio.";
        case "okr_not_found":
          return "No se encontro el OKR.";
        case "kr_not_found":
          return "No se encontro el KR.";
        case "self_link":
          return "No podes alinear un OKR consigo mismo.";
        case "cycle_detected":
          return "Esa alineacion generaria un ciclo. Elegi otro OKR.";
        default:
          return parsed?.message || raw;
      }
    } catch {
      return raw;
    }
  };

  const load = () => {
    if (!okrId) return;
    Promise.all([apiGet<OkrDetail>(`/okrs/${okrId}`), apiGet<OkrListItem[]>(`/okrs`)])
      .then(([detail, list]) => {
        setData(detail);
        setAllOkrs(list);
      })
      .catch((e) => setErr(formatApiError(e.message)));
  };

  useEffect(() => {
    load();
  }, [okrId]);

  if (!data) return <div style={{ padding: 16 }}>Cargando.</div>;

  const panelStyle = {
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 12,
    background: "var(--panel)",
  };

  const healthOrder: Record<string, number> = {
    no_target: 0,
    no_checkins: 1,
    off_track: 2,
    at_risk: 3,
    on_track: 4,
  };

  const selectableKrs = data.krs.filter(
    (kr) => kr.progressPct === null || kr.progressPct < 100
  );
  const alignedToIds = new Set((data.alignedTo ?? []).map((okr) => okr.id.toLowerCase()));
  const selectableAlignTargets = allOkrs.filter(
    (okr) => okr.id.toLowerCase() !== data.id.toLowerCase() && !alignedToIds.has(okr.id.toLowerCase())
  );
  const sortedKrs = [...data.krs].sort((a, b) => {
    if (!krSort) return 0;
    const dir = krSort.dir === "asc" ? 1 : -1;
    switch (krSort.key) {
      case "title":
        return a.title.localeCompare(b.title) * dir;
      case "metricName":
        return (a.metricName ?? "").localeCompare(b.metricName ?? "") * dir;
      case "currentValue":
        return ((a.currentValue ?? 0) - (b.currentValue ?? 0)) * dir;
      case "targetValue":
        return ((a.targetValue ?? 0) - (b.targetValue ?? 0)) * dir;
      case "progress":
        return ((a.progressPct ?? 0) - (b.progressPct ?? 0)) * dir;
      case "health":
        return ((healthOrder[a.health] ?? 0) - (healthOrder[b.health] ?? 0)) * dir;
      case "insight":
        return (a.insights?.explanationShort ?? "")
          .localeCompare(b.insights?.explanationShort ?? "") * dir;
      default:
        return 0;
    }
  });

  const renderKrSortHeader = (label: string, key: KrSortKey) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span>{label}</span>
      <button
        style={{ padding: "2px 6px", fontSize: 12, opacity: krSort?.key === key && krSort?.dir === "asc" ? 1 : 0.5 }}
        onClick={() => setKrSort({ key, dir: "asc" })}
      >
        ▲
      </button>
      <button
        style={{ padding: "2px 6px", fontSize: 12, opacity: krSort?.key === key && krSort?.dir === "desc" ? 1 : 0.5 }}
        onClick={() => setKrSort({ key, dir: "desc" })}
      >
        ▼
      </button>
    </div>
  );
  const selectedKr = selectableKrs.find((kr) => kr.id === checkinForm.krId);
  const metricLabel = selectedKr?.metricName || selectedKr?.title || "la metrica";
  const unitLabel = selectedKr?.unit || "";
  const isPercentUnit = /%|porcent/i.test(unitLabel);
  const checkinPlaceholder = isPercentUnit
    ? `Ingrese el valor actual para la metrica ${metricLabel} (%)`
    : `Ingrese el valor actual para la metrica ${metricLabel}`;

  const handleDeleteOkr = async () => {
    if (!okrId) return;
    try {
      console.log("[okr] delete-info request", { okrId });
      const info = await apiGet<{ okrId: string; krCount: number; checkinsCount: number }>(
        `/okrs/${okrId}/delete-info`
      );
      console.log("[okr] delete-info response", info);
      const message = [
        "Vas a borrar este OKR.",
        info.krCount > 0 ? `Incluye ${info.krCount} KR(s).` : "No tiene KRs.",
        info.checkinsCount > 0
          ? `Se eliminaran ${info.checkinsCount} check-in(s).`
          : "No hay check-ins asociados.",
        "Esta accion no se puede deshacer. Continuar?",
      ].join(" ");
      setDeleteConfirm({ type: "okr", okrId, message });
    } catch (e: any) {
      setErr(formatApiError(e.message));
    }
  };

  const handleDeleteKr = async (krId: string) => {
    try {
      console.log("[kr] delete-info request", { krId });
      const info = await apiGet<{ krId: string; checkinsCount: number }>(
        `/krs/${krId}/delete-info`
      );
      console.log("[kr] delete-info response", info);
      const message = [
        "Vas a borrar este KR.",
        info.checkinsCount > 0
          ? `Se eliminaran ${info.checkinsCount} check-in(s).`
          : "No hay check-ins asociados.",
        "Esta accion no se puede deshacer. Continuar?",
      ].join(" ");
      setDeleteConfirm({ type: "kr", krId, message });
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

  const openSection = (id: string) => {
    const el = document.getElementById(id) as HTMLDetailsElement | null;
    if (el) {
      el.open = true;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="page">
      <div className="page-content">
        {err && (
          <div style={{ ...panelStyle, borderColor: "#5a2b2b", color: "#f5b4b4", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>{err}</div>
              <button onClick={() => setErr(null)}>Cerrar</button>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <div style={{ ...panelStyle, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Confirmar borrado</div>
            <div style={{ marginBottom: 8 }}>{deleteConfirm.message}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setDeleteConfirm(null)}>Cancelar</button>
              <button
                onClick={async () => {
                  try {
                    if (deleteConfirm.type === "okr" && deleteConfirm.okrId) {
                      console.log("[okr] delete request", { okrId: deleteConfirm.okrId });
                      await apiDelete<{ ok: boolean }>(`/okrs/${deleteConfirm.okrId}`);
                      console.log("[okr] delete response", { okrId: deleteConfirm.okrId });
                      window.location.href = "/";
                      return;
                    }
                    if (deleteConfirm.type === "kr" && deleteConfirm.krId) {
                      console.log("[kr] delete request", { krId: deleteConfirm.krId });
                      await apiDelete<{ ok: boolean }>(`/krs/${deleteConfirm.krId}`);
                      console.log("[kr] delete response", { krId: deleteConfirm.krId });
                      setDeleteConfirm(null);
                      load();
                      return;
                    }
                    setDeleteConfirm(null);
                  } catch (e: any) {
                    setDeleteConfirm(null);
                    setErr(formatApiError(e.message));
                  }
                }}
              >
                Borrar
              </button>
            </div>
          </div>
        )}
        {alignConfirm && (
          <div style={{ ...panelStyle, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Confirmar alineacion</div>
            <div style={{ marginBottom: 8 }}>{alignConfirm.message}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setAlignConfirm(null)}>Cancelar</button>
              <button
                onClick={async () => {
                  try {
                    await apiDelete(
                      `/okrs/${alignConfirm.childOkrId}/alignments/${alignConfirm.parentOkrId}`
                    );
                    setAlignConfirm(null);
                    load();
                  } catch (e: any) {
                    setAlignConfirm(null);
                    setErr(formatApiError(e.message));
                  }
                }}
              >
                Quitar
              </button>
            </div>
          </div>
        )}
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

        <details id="section-alignment" open style={{ marginBottom: 16, ...panelStyle }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Alineacion</summary>
          <div style={{ marginTop: 8, display: "grid", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Este OKR contribuye a:</div>
              {(data.alignedTo ?? []).length === 0 && (
                <div style={{ color: "var(--muted)" }}>Sin alineaciones.</div>
              )}
              {(data.alignedTo ?? []).map((okr) => (
                <div
                  key={okr.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div>
                    <div>{okr.objective}</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>
                      {okr.fromDate} - {okr.toDate} · {okr.status}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setAlignConfirm({
                        parentOkrId: okr.id,
                        childOkrId: data.id,
                        message:
                          "Vas a quitar la alineacion entre estos OKRs. Esta accion no se puede deshacer. Continuar?",
                      });
                    }}
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>OKRs que contribuyen a este:</div>
              {(data.alignedFrom ?? []).length === 0 && (
                <div style={{ color: "var(--muted)" }}>Sin alineaciones.</div>
              )}
              {(data.alignedFrom ?? []).map((okr) => (
                <div
                  key={okr.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div>
                    <div>{okr.objective}</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>
                      {okr.fromDate} - {okr.toDate} · {okr.status}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setAlignConfirm({
                        parentOkrId: data.id,
                        childOkrId: okr.id,
                        message:
                          "Vas a quitar la alineacion entre estos OKRs. Esta accion no se puede deshacer. Continuar?",
                      });
                    }}
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 600 }}>Agregar alineacion</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select
                  value={alignTargetId}
                  onChange={(e) => setAlignTargetId(e.target.value)}
                >
                  <option value="">Selecciona un OKR</option>
                  {selectableAlignTargets.map((okr) => (
                    <option key={okr.id} value={okr.id}>
                      {okr.objective}
                    </option>
                  ))}
                </select>
                <select
                  value={alignDirection}
                  onChange={(e) => setAlignDirection(e.target.value as "up" | "down")}
                >
                  <option value="up">Contribuye a (up)</option>
                  <option value="down">Recibe contribucion (down)</option>
                </select>
                <button
                  disabled={alignBusy || !alignTargetId}
                  onClick={async () => {
                    if (!alignTargetId) return;
                    setAlignBusy(true);
                    try {
                      const childOkrId = alignDirection === "up" ? data.id : alignTargetId;
                      const parentOkrId = alignDirection === "up" ? alignTargetId : data.id;
                      await apiPost(`/okrs/${childOkrId}/alignments`, { targetOkrId: parentOkrId });
                      setAlignTargetId("");
                      load();
                    } catch (e: any) {
                      setErr(formatApiError(e.message));
                    } finally {
                      setAlignBusy(false);
                    }
                  }}
                >
                  {alignBusy ? "Agregando..." : "Agregar alineacion"}
                </button>
              </div>
              {alignTargetId && (
                <div style={{ color: "var(--muted)", fontSize: 12 }}>
                  {alignDirection === "up"
                    ? `"${data.objective}" contribuye a "${selectableAlignTargets.find((o) => o.id === alignTargetId)?.objective ?? ""}".`
                    : `"${selectableAlignTargets.find((o) => o.id === alignTargetId)?.objective ?? ""}" contribuye a "${data.objective}".`}
                </div>
              )}
            </div>
          </div>
        </details>

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
        <div className="table-wrap">
          <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>{renderKrSortHeader("Titulo", "title")}</th>
                <th>{renderKrSortHeader("Metrica", "metricName")}</th>
                <th>{renderKrSortHeader("Actual", "currentValue")}</th>
                <th>{renderKrSortHeader("Target", "targetValue")}</th>
                <th>{renderKrSortHeader("Progreso", "progress")}</th>
                <th>{renderKrSortHeader("Estado", "health")}</th>
                <th>{renderKrSortHeader("Estado y recomendacion", "insight")}</th>
                <th style={{ width: 120, whiteSpace: "nowrap" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sortedKrs.map((kr) => (
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
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => handleDeleteKr(kr.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <details id="section-ai-kr" open style={{ marginTop: 20, ...panelStyle }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>KRs (IA + manual)</summary>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
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
            {aiAddError && (
              <div style={{ border: "1px solid var(--border)", padding: 8, borderRadius: 8 }}>
                <div style={{ marginBottom: 6 }}>
                  <b>La IA marco issues para este KR:</b> {aiAddError.kr.title}
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  {aiAddError.issues.map((i, idx) => (
                    <div key={idx}>
                      <b>{i.severity.toUpperCase()}</b> {i.message}
                      {i.fixSuggestion ? ` (${i.fixSuggestion})` : ""}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => setAiAddError(null)}>Cancelar</button>
                  <button
                    onClick={async () => {
                      if (!okrId) return;
                      try {
                        await apiPost(`/krs`, {
                          okrId,
                          title: aiAddError.kr.title,
                          metricName: aiAddError.kr.metricName ?? null,
                          unit: aiAddError.kr.unit ?? null,
                          targetValue: aiAddError.kr.targetValue,
                          allowHigh: true,
                        });
                        setAiAddedTitles((prev) => [...prev, aiAddError.kr.title.toLowerCase()]);
                        setAiAddError(null);
                        load();
                      } catch (e: any) {
                        setErr(formatApiError(e.message));
                      }
                    }}
                  >
                    Agregar igual
                  </button>
                </div>
              </div>
            )}
            {aiDraft?.suggestedKrs?.length ? (
              <div style={{ display: "grid", gap: 8 }}>
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
                {aiDraft.suggestedKrs.map((kr, idx) => (
                  <div
                    key={idx}
                    style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr 1fr 1fr auto" }}
                  >
                    <input
                      value={kr.title}
                      onChange={(e) => {
                        setAiDraft((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.suggestedKrs];
                          next[idx] = { ...next[idx], title: e.target.value };
                          return { ...prev, suggestedKrs: next };
                        });
                      }}
                    />
                    <input
                      value={kr.metricName ?? ""}
                      onChange={(e) => {
                        setAiDraft((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.suggestedKrs];
                          next[idx] = { ...next[idx], metricName: e.target.value };
                          return { ...prev, suggestedKrs: next };
                        });
                      }}
                    />
                    <input
                      value={kr.unit ?? ""}
                      onChange={(e) => {
                        setAiDraft((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.suggestedKrs];
                          next[idx] = { ...next[idx], unit: e.target.value };
                          return { ...prev, suggestedKrs: next };
                        });
                      }}
                    />
                    <input
                      value={String(kr.targetValue ?? "")}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setAiDraft((prev) => {
                          if (!prev) return prev;
                          const next = [...prev.suggestedKrs];
                          next[idx] = { ...next[idx], targetValue: Number.isNaN(value) ? 0 : value };
                          return { ...prev, suggestedKrs: next };
                        });
                      }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={async () => {
                          if (!okrId) return;
                          try {
                            const normalized = kr.title.toLowerCase();
                            if (aiAddedTitles.includes(normalized)) {
                              return;
                            }
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
                            setAiAddedTitles((prev) => [...prev, normalized]);
                            load();
                          } catch (e: any) {
                            const raw = String(e?.message || "");
                            try {
                              const parsed = JSON.parse(raw.replace(/^API \d+:\s*/i, ""));
                              if (parsed?.error === "ai_validation_failed" && parsed?.issues) {
                                setAiAddError({
                                  kr,
                                  issues: parsed.issues,
                                });
                                return;
                              }
                            } catch {
                              // ignore parse errors
                            }
                            setErr(formatApiError(raw));
                          }
                        }}
                      >
                        {aiAddedTitles.includes(kr.title.toLowerCase()) ? "Agregado" : "Agregar"}
                      </button>
                      <button
                        title="Eliminar sugerencia"
                        onClick={() => {
                          setAiDraft((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.suggestedKrs];
                            next.splice(idx, 1);
                            return { ...prev, suggestedKrs: next };
                          });
                        }}
                      >
                        Borrar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Agregar KR manual</div>
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
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                  fontWeight: 600,
                  color: "var(--muted)",
                }}
              >
                <div>Titulo</div>
                <div>Metrica</div>
                <div>Unidad</div>
                <div>Target</div>
              </div>
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                  marginTop: 8,
                }}
              >
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
              <div style={{ marginTop: 8 }}>
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
              </div>
            </div>
          </div>
        </details>

        <details id="section-checkin" style={{ marginTop: 12, ...panelStyle }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Registrar check-in</summary>
          {checkinError && (
            <div
              style={{
                marginTop: 8,
                padding: 8,
                border: "1px solid #5a2b2b",
                color: "#f5b4b4",
                borderRadius: 8,
              }}
            >
              {checkinError}
            </div>
          )}
          {selectableKrs.length === 0 && (
            <div style={{ color: "#a6adbb", marginTop: 8 }}>
              Todos los KRs ya alcanzaron el 100%. No se pueden registrar mas avances.
            </div>
          )}
          <div
            style={{
              display: "grid",
              gap: 8,
              gridTemplateColumns: "2fr 1fr 2fr",
              marginTop: 8,
            }}
          >
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
              ref={checkinValueRef}
              placeholder={checkinPlaceholder}
              inputMode="decimal"
              value={checkinForm.value}
              onChange={(e) => setCheckinForm({ ...checkinForm, value: e.target.value })}
            />
            <input
              placeholder="Comentario (opcional)"
              value={checkinForm.comment}
              onChange={(e) => setCheckinForm({ ...checkinForm, comment: e.target.value })}
            />
          </div>
          {unitLabel && (
            <div style={{ marginTop: 6, color: "var(--muted)" }}>
              Unidad de la metrica: {unitLabel}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <button
              disabled={busy || selectableKrs.length === 0}
              onClick={async () => {
                if (!checkinForm.krId) return;
                setCheckinError(null);
                const numericValue = Number(checkinForm.value);
                if (checkinForm.value.trim().length === 0 || Number.isNaN(numericValue)) {
                  setCheckinError("Ingresa un valor numerico valido para el check-in.");
                  checkinValueRef.current?.focus();
                  checkinValueRef.current?.select();
                  return;
                }
                if (isPercentUnit && (numericValue < 0 || numericValue > 100)) {
                  setCheckinError("El valor debe estar entre 0 y 100 para una metrica porcentual.");
                  checkinValueRef.current?.focus();
                  checkinValueRef.current?.select();
                  return;
                }
                setBusy(true);
                try {
                  await apiPost(`/krs/${checkinForm.krId}/checkins`, {
                    value: numericValue,
                    comment: checkinForm.comment || null,
                  });
                  setCheckinForm({ krId: "", value: "", comment: "" });
                  setCheckinError(null);
                  load();
                } catch (e: any) {
                  const msg = formatApiError(e.message);
                  setCheckinError(msg);
                  checkinValueRef.current?.focus();
                  checkinValueRef.current?.select();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Registrando..." : "Guardar check-in"}
            </button>
          </div>
        </details>
        <div className="sticky-actions" style={{ marginTop: 16 }}>
          <button onClick={() => openSection("section-alignment")}>Alineacion</button>
          <button onClick={() => openSection("section-ai-kr")}>KRs (IA + manual)</button>
          <button onClick={() => openSection("section-checkin")}>Registrar check-in</button>
        </div>
      </div>
    </div>
  );
}
