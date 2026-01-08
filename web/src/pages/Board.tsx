import { Fragment, useEffect, useState } from "react";
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

type SortKey = "objective" | "fromDate" | "krCount" | "progress" | "health" | "motivo";

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
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [groupByQuarter, setGroupByQuarter] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    apiGet<OkrBoard[]>("/okrs")
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <pre>{err}</pre>;

  const healthOrder: Record<string, number> = {
    no_target: 0,
    no_checkins: 1,
    off_track: 2,
    at_risk: 3,
    on_track: 4,
  };

  const dateValue = (value: string) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  };

  const sorted = [...data].sort((a, b) => {
    if (!sort) return 0;
    const dir = sort.dir === "asc" ? 1 : -1;
    switch (sort.key) {
      case "objective":
        return a.objective.localeCompare(b.objective) * dir;
      case "fromDate":
        return (dateValue(a.fromDate) - dateValue(b.fromDate)) * dir;
      case "krCount":
        return ((a.summary?.krCount ?? 0) - (b.summary?.krCount ?? 0)) * dir;
      case "progress":
        return ((a.summary?.avgProgressPct ?? 0) - (b.summary?.avgProgressPct ?? 0)) * dir;
      case "health":
        return (
          ((healthOrder[a.summary?.overallHealth ?? ""] ?? 0) -
            (healthOrder[b.summary?.overallHealth ?? ""] ?? 0)) *
          dir
        );
      case "motivo":
        return (a.insights?.explanationShort ?? "").localeCompare(b.insights?.explanationShort ?? "") * dir;
      default:
        return 0;
    }
  });

  const getQuarterGroup = (fromDate: string) => {
    const d = new Date(fromDate);
    if (Number.isNaN(d.getTime())) return null;
    const year = d.getUTCFullYear();
    const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
    return { year, quarter, label: `${year} Q${quarter}` };
  };

  const groupedRows = () => {
    const groups = new Map<string, { label: string; year: number; quarter: number; items: OkrBoard[] }>();
    for (const item of sorted) {
      const g = getQuarterGroup(item.fromDate);
      const key = g ? `${g.year}-Q${g.quarter}` : "sin-fecha";
      const label = g ? g.label : "Sin fecha";
      if (!groups.has(key)) {
        groups.set(key, { label, year: g?.year ?? 0, quarter: g?.quarter ?? 0, items: [] });
      }
      groups.get(key)!.items.push(item);
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.quarter - b.quarter;
    });
  };

  const renderSortHeader = (label: string, key: SortKey) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span>{label}</span>
      <button
        style={{ padding: "2px 6px", fontSize: 12, opacity: sort?.key === key && sort?.dir === "asc" ? 1 : 0.5 }}
        onClick={() => setSort({ key, dir: "asc" })}
      >
        ▲
      </button>
      <button
        style={{ padding: "2px 6px", fontSize: 12, opacity: sort?.key === key && sort?.dir === "desc" ? 1 : 0.5 }}
        onClick={() => setSort({ key, dir: "desc" })}
      >
        ▼
      </button>
    </div>
  );

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
        <div style={{ display: "flex", justifyContent: "flex-end", margin: "12px 0" }}>
          <button onClick={() => setGroupByQuarter((prev) => !prev)}>
            {groupByQuarter ? "Quitar agrupacion" : "Agrupar por trimestre"}
          </button>
        </div>
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>{renderSortHeader("Objetivo", "objective")}</th>
            <th>{renderSortHeader("Fechas", "fromDate")}</th>
            <th>{renderSortHeader("KRs", "krCount")}</th>
            <th>{renderSortHeader("Progreso", "progress")}</th>
            <th>{renderSortHeader("Estado", "health")}</th>
            <th>{renderSortHeader("Motivo", "motivo")}</th>
          </tr>
        </thead>
        <tbody>
          {!groupByQuarter &&
            sorted.map((o) => (
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
          {groupByQuarter &&
            groupedRows().map((group) => (
              <Fragment key={group.label}>
                <tr style={{ background: "var(--panel)" }}>
                  <td colSpan={6} style={{ fontWeight: 600 }}>
                    {group.label}
                  </td>
                </tr>
                {group.items.map((o) => (
                  <tr key={o.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td>
                      <Link to={`/okr/${o.id}`}>{o.objective}</Link>
                    </td>
                    <td>
                      {o.fromDate} - {o.toDate}
                    </td>
                    <td>{o.summary?.krCount ?? 0}</td>
                    <td>
                      {o.summary?.avgProgressPct === null ? "-" : `${o.summary.avgProgressPct}%`}
                    </td>
                    <td>{formatHealth(o.summary?.overallHealth ?? null)}</td>
                    <td>{o.insights?.explanationShort ?? "-"}</td>
                  </tr>
                ))}
              </Fragment>
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
