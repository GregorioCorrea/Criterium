import { useEffect, useState } from "react";
import { apiGet } from "../api";
import { Link } from "react-router-dom";

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

export default function Board() {
  const [data, setData] = useState<OkrBoard[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiGet<OkrBoard[]>("/okrs")
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <pre>{err}</pre>;

  return (
    <div style={{ padding: 16, fontFamily: "system-ui" }}>
      <h2>Criterium OKRs</h2>
      <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>Objetivo</th>
            <th>Fechas</th>
            <th>KRs</th>
            <th>Progreso</th>
            <th>Health</th>
            <th>Why</th>
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
              <td>{o.summary?.overallHealth ?? "-"}</td>
              <td>{o.insights?.explanationShort ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
