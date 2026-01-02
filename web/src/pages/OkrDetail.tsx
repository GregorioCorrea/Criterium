import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiGet, apiPost } from "../api";
import AiStatus from "../components/AiStatus";

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

  const load = () => {
    if (!okrId) return;
    apiGet<OkrDetail>(`/okrs/${okrId}`)
      .then(setData)
      .catch((e) => setErr(e.message));
  };

  useEffect(() => {
    load();
  }, [okrId]);

  if (err) return <pre style={{ padding: 16 }}>{err}</pre>;
  if (!data) return <div style={{ padding: 16 }}>Cargando.</div>;

  return (
    <div style={{ padding: 16, fontFamily: "system-ui" }}>
      <div style={{ marginBottom: 12 }}>
        <Link to="/">{"<"} Volver</Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2>{data.objective}</h2>
        <AiStatus />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div>
          <b>Fechas:</b> {data.fromDate} - {data.toDate}
        </div>
        <div>
          <b>Status:</b> {data.status}
        </div>
        <div>
          <b>Health:</b> {data.summary?.overallHealth}
        </div>
        <div>
          <b>Progreso promedio:</b> {data.summary?.avgProgressPct ?? "-"}%
        </div>
        <div>
          <b>KRs:</b> {data.summary?.krCount ?? 0}
        </div>
      </div>

      <div style={{ marginBottom: 16, padding: 12, border: "1px solid #eee" }}>
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
            <th>Health</th>
            <th>Estado y recomendacion</th>
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
              <td>{kr.health}</td>
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
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 24, padding: 12, border: "1px solid #eee" }}>
        <h3>Agregar KR</h3>
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
              load();
            } catch (e: any) {
              setErr(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Guardando..." : "Guardar KR"}
        </button>
      </div>

      <div style={{ marginTop: 24, padding: 12, border: "1px solid #eee" }}>
        <h3>Registrar check-in</h3>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr 2fr" }}>
          <select
            value={checkinForm.krId}
            onChange={(e) => setCheckinForm({ ...checkinForm, krId: e.target.value })}
          >
            <option value="">Elegi un KR</option>
            {data.krs.map((kr) => (
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
          disabled={busy}
          onClick={async () => {
            if (!checkinForm.krId) return;
            setBusy(true);
            try {
              await apiPost(`/krs/${checkinForm.krId}/checkins`, {
                value: Number(checkinForm.value),
                comment: checkinForm.comment || null,
              });
              setCheckinForm({ krId: "", value: "", comment: "" });
              load();
            } catch (e: any) {
              setErr(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Registrando..." : "Guardar check-in"}
        </button>
      </div>
    </div>
  );
}
