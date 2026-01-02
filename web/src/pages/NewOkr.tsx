import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiPost } from "../api";
import AiStatus from "../components/AiStatus";

type DraftResponse = {
  objectiveRefined: string | null;
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

export default function NewOkr() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [objective, setObjective] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [context, setContext] = useState("");
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [krs, setKrs] = useState<KrDraft[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleDraft = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await apiPost<DraftResponse>("/ai/okr/draft", {
        objective,
        fromDate,
        toDate,
        context,
      });
      setDraft(res);
      setKrs(
        res.suggestedKrs.map((kr) => ({
          title: kr.title,
          metricName: kr.metricName ?? "",
          unit: kr.unit ?? "",
          targetValue: String(kr.targetValue ?? ""),
        }))
      );
      setStep(2);
    } catch (e: any) {
      setErr(e.message);
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
      setStep(3);
    } catch (e: any) {
      setErr(e.message);
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
      navigate(`/okr/${res.okr.id}`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const hasHigh = issues.some((i) => i.severity === "high");

  return (
    <div
      style={{
        padding: 16,
        fontFamily: "system-ui",
        color: "#e6e6e6",
        background: "#0b0f14",
        minHeight: "100vh",
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <Link to="/">{"<"} Volver</Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2>Nuevo OKR</h2>
        <AiStatus />
      </div>

      {err && <pre style={{ color: "crimson" }}>{err}</pre>}

      {step === 1 && (
        <div style={{ display: "grid", gap: 12, maxWidth: 640 }}>
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
            {busy ? "Analizando..." : "Proponer con IA"}
          </button>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: "grid", gap: 12 }}>
          {draft?.objectiveRefined && (
            <div style={{ padding: 8, border: "1px solid #eee" }}>
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
          {krs.map((kr, idx) => (
            <div key={idx} style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
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
              <input
                placeholder="Target"
                value={kr.targetValue}
                onChange={(e) => {
                  const next = [...krs];
                  next[idx].targetValue = e.target.value;
                  setKrs(next);
                }}
              />
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
            <button disabled={busy} onClick={handleValidate}>
              {busy ? "Validando..." : "Validar con IA"}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: "grid", gap: 12 }}>
          <h3>Validacion</h3>
          {issues.length === 0 && <div>Sin issues.</div>}
          {issues.map((i, idx) => (
            <div key={idx} style={{ border: "1px solid #eee", padding: 8 }}>
              <b>{i.severity.toUpperCase()}</b> - {i.message}
              {i.fixSuggestion && <div>Recomendacion: {i.fixSuggestion}</div>}
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep(2)}>Volver</button>
            <button disabled={busy || hasHigh} onClick={handleCreate}>
              {hasHigh ? "Corregi issues high" : busy ? "Creando..." : "Crear OKR"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
