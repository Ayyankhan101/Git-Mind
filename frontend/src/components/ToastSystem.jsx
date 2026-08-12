import React, { useState, useCallback, useRef } from "react";
import { Check, AlertTriangle, X, Info } from "lucide-react";

const ICON = {
  success: Check,
  danger: AlertTriangle,
  info: Info,
};

export default function ToastSystem({ toasts, onDismiss }) {
  const [exiting, setExiting] = useState(new Set());
  const timers = useRef({});

  const handleDismiss = useCallback((id) => {
    if (timers.current[id]) return;
    setExiting((prev) => new Set([...prev, id]));
    timers.current[id] = setTimeout(() => {
      onDismiss(id);
      delete timers.current[id];
    }, 250);
  }, [onDismiss]);

  if (!toasts.length) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => {
        const Icon = ICON[t.kind] || Info;
        const isExiting = exiting.has(t.id);
        return (
          <div
            key={t.id}
            className={`toast${t.kind ? ` ${t.kind}` : ""}${isExiting ? " toast-exit" : ""}`}
          >
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
            <button className="btn-icon" onClick={() => handleDismiss(t.id)} aria-label="Dismiss notification">
              <X size={12} strokeWidth={1.5} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
