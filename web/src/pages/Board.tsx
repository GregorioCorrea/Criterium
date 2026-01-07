import { useEffect, useState } from "react";
import { apiGet } from "../api";
import { Link, useNavigate } from "react-router-dom";
import AiStatus from "../components/AiStatus";
import NewOkrModal from "../components/NewOkrModal";

type OkrBoard = {
  id: string;
  objective: string;
  fromDate: string;
  toDate: string;
  status: string;
  summary: {
    krCount: number;
    avgProgressPct: number | null;
    overallHealth: string;
  };
  insights?: {
    explanationShort: string;
    suggestion: string;
    computedAt: string;
    source: string;
  } | null;
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

export default function Board() {
  const [data, setData] = useState<OkrBoard[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    apiGet<OkrBoard[]>("/okrs")
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <pre>{err}</pre>;

  return (
    <div className="page">
      <div className="page-content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2>Criterium OKRs</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <AiStatus />
            <button onClick={() => setShowNew(true)}>Nuevo OKR</button>
          </div>
        </div>
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>Objetivo</th>
            <th>Fechas</th>
            <th>KRs</th>
            <th>Progreso</th>
            <th>Estado</th>
            <th>Motivo</th>
          </tr>
        </thead>
        <tbody>
          {data.map((o) => (
            <tr key={o.id} style={{ borderBottom: "1px solid #eee" }}>
              <td>
                <Link to={`/okr/${o.id}`}>{o.objective}</Link>
              </td>
              <td>
                {o.fromDate} - {o.toDate}
              </td>
              <td>{o.summary?.krCount ?? 0}</td>
              <td>{o.summary?.avgProgressPct === null ? "-" : `${o.summary.avgProgressPct}%`}</td>
              <td>{formatHealth(o.summary?.overallHealth ?? null)}</td>
              <td>{o.insights?.explanationShort ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {showNew && (
        <NewOkrModal
          onClose={() => setShowNew(false)}
          onCreated={(okrId) => navigate(`/okr/${okrId}`)}
        />
      )}
      </div>
    </div>
  );
}
