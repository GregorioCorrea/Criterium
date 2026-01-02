import { useEffect, useState } from "react";
import { apiGet } from "../api";

type AiStatusResponse = {
  enabled: boolean;
  ok: boolean;
  checkedAt: string;
};

export default function AiStatus() {
  const [status, setStatus] = useState<AiStatusResponse | null>(null);

  useEffect(() => {
    apiGet<AiStatusResponse>("/ai/status")
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, ok: false, checkedAt: "" }));
  }, []);

  const ok = status?.enabled && status?.ok;
  const dotStyle: React.CSSProperties = {
    width: 12,
    height: 12,
    borderRadius: 999,
    display: "inline-block",
    background: ok ? "#36c37c" : "#6b7280",
    border: "1px solid #2a3440",
  };
  return (
    <div className="ai-status" title="Estado de IA">
      <span className={`ai-dot ${ok ? "ai-dot--ok" : "ai-dot--off"}`} style={dotStyle} />
      <span>Estado de IA</span>
    </div>
  );
}
