import React from "react";
import { Check, AlertTriangle, X, Info } from "lucide-react";

const ICON = {
  success: Check,
  danger: AlertTriangle,
  info: Info,
};

export default function ToastSystem({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => {
        const Icon = ICON[t.kind] || Info;
        return (
          <div key={t.id} className={`toast${t.kind ? ` ${t.kind}` : ""}`}>
            <span className="toast-icon">
              <Icon size={15} strokeWidth={1.5} />
            </span>
            <div className="toast-body">
              <div className="toast-title">
                {t.title}
                {t.count > 1 && <span className="toast-count">×{t.count}</span>}
              </div>
              {t.sub && <div className="toast-sub">{t.sub}</div>}
            </div>
            <button className="btn-icon" onClick={() => onDismiss(t.id)}>
              <X size={12} strokeWidth={1.5} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
