import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type Props = {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  dirty?: boolean;
};

export default function Modal({ title, onClose, children, dirty }: Props) {
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dirty) {
          setConfirmClose(true);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, onClose]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={() => (dirty ? setConfirmClose(true) : onClose())}
    >
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title ?? ""}</div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            x
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {confirmClose && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <div style={{ marginBottom: 8 }}>Hay datos sin guardar.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmClose(false)}>Volver</button>
              <button onClick={onClose}>Salir</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
