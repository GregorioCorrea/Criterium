import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiGet } from "../api";

type Kr = {
  id: string;
  title: string;
  metricName: string | null;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  progressPct: number | null;
  health: string;
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
  krs: Kr[];
};

export default function OkrDetail() {
  const { okrId } = useParams();
  const [data, setData] = useState<OkrDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!okrId) return;
    apiGet<OkrDetail>(`/okrs/${okrId}`)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [okrId]);

  if (err) return <pre style={{ padding: 16 }}>{err}</pre>;
  if (!data) return <div style={{ padding: 16 }}>Cargando…</div>;

  return (
    <div style={{ padding: 16, fontFamily: "system-ui" }}>
      <div style={{ marginBottom: 12 }}>
        <Link to="/">← Volver</Link>
      </div>

      <h2>{data.objective}</h2>
      <div style={{ marginBottom: 16 }}>
        <div><b>Fechas:</b> {data.fromDate} → {data.toDate}</div>
        <div><b>Status:</b> {data.status}</div>
        <div><b>Health:</b> {data.summary?.overallHealth}</div>
        <div><b>Progreso promedio:</b> {data.summary?.avgProgressPct ?? "-"}%</div>
        <div><b>KRs:</b> {data.summary?.krCount ?? 0}</div>
      </div>

      <h3>Key Results</h3>
      <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>Título</th>
            <th>Métrica</th>
            <th>Actual</th>
            <th>Target</th>
            <th>Progreso</th>
            <th>Health</th>
          </tr>
        </thead>
        <tbody>
          {data.krs.map((kr) => (
            <tr key={kr.id} style={{ borderBottom: "1px solid #eee" }}>
              <td>{kr.title}</td>
              <td>{kr.metricName ?? "-"}</td>
              <td>{kr.currentValue ?? "-"}</td>
              <td>{kr.targetValue ?? "-"} {kr.unit ?? ""}</td>
              <td>{kr.progressPct === null ? "-" : `${Math.round(kr.progressPct)}%`}</td>
              <td>{kr.health}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
