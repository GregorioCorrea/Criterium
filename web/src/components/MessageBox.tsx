import type { ReactNode } from "react";

type Props = {
  title?: string;
  message: string;
  onClose: () => void;
  actions?: ReactNode;
};

export default function MessageBox({ title, message, onClose, actions }: Props) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel message-box-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title ?? "Mensaje"}</div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            x
          </button>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <div>{message}</div>
          <div className="message-box-actions">
            {actions ?? <button onClick={onClose}>Cerrar</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
