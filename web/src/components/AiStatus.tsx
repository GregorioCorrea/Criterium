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
  return (
    <div className="ai-status" title="Estado de IA">
      <span className={`ai-dot ${ok ? "ai-dot--ok" : "ai-dot--off"}`} />
      <span>Estado de IA</span>
    </div>
  );
}
