import React, { useState } from "react";
import { AlertTriangle, Lock, X, RefreshCw } from "../icons";

export default function ShareErrorOverlay({
  error,
  onRetry,
  onUnlock,
  onClose,
}) {
  const [token, setToken] = useState("");
  const locked = error?.kind === "locked";
  return (
    <div
      className="share-error-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Shared analysis error"
    >
      <div className="share-error-panel">
        <button
          className="btn-icon"
          style={{ position: "absolute", top: 12, right: 12 }}
          onClick={onClose}
          aria-label="Close"
        >
          <X size={14} />
        </button>
        <div className="share-error-icon">
          {locked ? <Lock size={18} /> : <AlertTriangle size={18} />}
        </div>
        <div className="share-error-title">
          {locked ? "This analysis is locked" : "Could not open analysis"}
        </div>
        <div className="share-error-message">
          {error?.message || "Something went wrong."}
        </div>
        {locked ? (
          <div className="share-error-form">
            <input
              type="password"
              aria-label="GitHub token"
              placeholder="Paste your GitHub token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && token.trim()) onUnlock(token.trim());
              }}
            />
            <button
              className="btn btn-primary"
              onClick={() => onUnlock(token.trim())}
              disabled={!token.trim()}
            >
              Unlock
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={onRetry}>
            <RefreshCw size={13} /> Retry
          </button>
        )}
      </div>
    </div>
  );
}
