import React, { useState, useEffect, useRef } from "react";
import {
  X,
  FileText,
  AlertTriangle,
  Copy,
  Check as CheckIcon,
} from "lucide-react";
import { WS_BASE, fetchIncidentReport } from "../api";

const ROLE_COLOR = {
  CEO: "#fbbf24",
  Legal: "#818cf8",
  Engineering: "#34d399",
  Reporter: "#f87171",
};
const WS_URL = `${WS_BASE}/ws/crisis`;
const REPORTER_INTERVAL = 45;

export default function CrisisChat({ finding, sessionId, onClose }) {
  const [messages, setMessages] = useState([]);
  const [countdown, setCountdown] = useState(REPORTER_INTERVAL);
  const [resolved, setResolved] = useState(false);
  const [leaked, setLeaked] = useState(false);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);
  const [reportCopied, setReportCopied] = useState(false);
  const bottomRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!finding || !sessionId) return;
    let mounted = true;
    let ws;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      setError("WebSocket unavailable.");
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (mounted) setConnected(true);
      ws.send(
        JSON.stringify({ session_id: sessionId, finding_id: finding.id }),
      );
    };

    ws.onmessage = (evt) => {
      if (!mounted) return;
      let data;
      try {
        data = JSON.parse(evt.data);
      } catch {
        return;
      }
      if (data.error) {
        setError(data.error);
        return;
      }
      if (data.kind === "leak") {
        setMessages((prev) => [
          ...prev,
          {
            role: "Reporter",
            color: ROLE_COLOR.Reporter,
            text: data.content,
            isLeak: true,
          },
        ]);
        setLeaked(true);
        return;
      }
      if (data.kind === "resolved") {
        setResolved(true);
        return;
      }
      if (data.kind === "message" && data.agent) {
        setMessages((prev) => [
          ...prev,
          {
            role: data.agent,
            color: ROLE_COLOR[data.agent] || "#94a3b8",
            text: data.content,
          },
        ]);
        setCountdown(REPORTER_INTERVAL);
      }
    };

    ws.onerror = () => {
      if (mounted) {
        setError("Cannot reach backend on port 8002.");
        setConnected(false);
      }
    };
    ws.onclose = () => {
      if (mounted) setConnected(false);
    };
    return () => {
      mounted = false;
      try {
        ws.close();
      } catch {}
    };
  }, [finding, sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (resolved || leaked || error) return;
    const id = setInterval(
      () => setCountdown((c) => (c <= 0 ? REPORTER_INTERVAL : c - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [resolved, leaked, error]);

  const timerDanger = countdown <= 10 && !resolved && !leaked;
  const crisisOver = resolved || leaked;

  const generateReport = async () => {
    if (!crisisOver) return;
    setReportLoading(true);
    setReportError(null);
    try {
      const outcome = resolved ? "resolved" : "leaked";
      const data = await fetchIncidentReport(
        sessionId,
        finding,
        messages,
        outcome,
      );
      setReport(data.report);
    } catch (err) {
      setReportError(err.message);
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div
      className="crisis-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="crisis-panel">
        {/* Header */}
        <div className="crisis-header">
          <div className="crisis-tag">
            <span className="label">CRISIS ROOM</span>
            {connected && !resolved && !leaked && (
              <span className="live">LIVE</span>
            )}
          </div>
          <div className="crisis-title">{finding.title}</div>
          {!resolved && !leaked && !error && (
            <div className={`crisis-timer${timerDanger ? " urgent" : ""}`}>
              0:{String(countdown).padStart(2, "0")}
              <div className="crisis-subtimer">until reporter publishes</div>
            </div>
          )}
          <button
            className="btn-icon"
            style={{ position: "absolute", top: 16, right: 16 }}
            onClick={onClose}
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Role legend */}
        <div
          style={{
            display: "flex",
            gap: 16,
            padding: "10px 26px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {[
            ["CEO", ROLE_COLOR.CEO],
            ["Legal", ROLE_COLOR.Legal],
            ["Engineering", ROLE_COLOR.Engineering],
          ].map(([role, color]) => (
            <div
              key={role}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                color: "var(--text-3)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: color,
                  flexShrink: 0,
                }}
              />
              {role}
            </div>
          ))}
        </div>

        {/* Messages */}
        <div className="crisis-body">
          {error && (
            <div
              style={{
                padding: "12px 14px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 6,
                fontSize: 12,
                color: "#fca5a5",
              }}
            >
              {error}
            </div>
          )}

          {connected &&
            !resolved &&
            !leaked &&
            messages.length === 0 &&
            !error && (
              <div style={{ color: "var(--text-3)", fontSize: 13 }}>
                Connecting to crisis simulation…
              </div>
            )}

          {messages.map((msg, i) => {
            const roleKey = msg.role.toLowerCase();
            const cls = msg.isLeak ? "crisis-msg eng" : `crisis-msg ${roleKey}`;
            return (
              <div key={i} className={cls}>
                <div className="from">
                  {msg.role}
                  {msg.isLeak && " · BREAKING NEWS"}
                </div>
                <div className="text">{msg.text}</div>
              </div>
            );
          })}

          {resolved && (
            <div
              style={{
                padding: "16px",
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.2)",
                borderRadius: 6,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--success)",
                  marginBottom: 4,
                }}
              >
                Incident Contained
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                Team issued statement before reporter published.
              </div>
            </div>
          )}

          {leaked && (
            <div
              style={{
                padding: "16px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 6,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--danger)",
                  marginBottom: 4,
                }}
              >
                BREAKING: Reporter Published
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                The team failed to contain the incident in time.
              </div>
            </div>
          )}

          {/* Incident report */}
          {report && (
            <div
              style={{
                marginTop: 12,
                padding: "14px",
                background: "var(--surface-2)",
                borderRadius: 8,
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-3)",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <FileText size={11} strokeWidth={1.5} />
                INCIDENT REPORT
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(report).then(() => {
                      setReportCopied(true);
                      setTimeout(() => setReportCopied(false), 2000);
                    });
                  }}
                  style={{
                    marginLeft: "auto",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: reportCopied ? "var(--success)" : "var(--text-3)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}
                >
                  {reportCopied ? (
                    <CheckIcon size={10} strokeWidth={2} />
                  ) : (
                    <Copy size={10} strokeWidth={1.5} />
                  )}
                  {reportCopied ? "Copied" : "Copy"}
                </button>
              </div>
              <pre
                style={{
                  fontSize: 12,
                  color: "var(--text-2)",
                  whiteSpace: "pre-wrap",
                  fontFamily: "var(--font-mono)",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {report}
              </pre>
            </div>
          )}

          {reportError && (
            <div
              style={{
                marginTop: 8,
                padding: "8px 12px",
                background: "rgba(239,68,68,0.08)",
                borderRadius: 6,
                fontSize: 12,
                color: "#fca5a5",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <AlertTriangle size={11} strokeWidth={1.5} /> {reportError}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 26px",
            borderTop: "1px solid var(--border)",
            flexShrink: 0,
            display: "flex",
            gap: 8,
          }}
        >
          {crisisOver && !report && (
            <button
              className="btn btn-ghost"
              onClick={generateReport}
              disabled={reportLoading}
              style={{ flex: 1 }}
            >
              {reportLoading ? (
                <>
                  <span className="spinner" /> Generating Report…
                </>
              ) : (
                <>
                  <FileText size={13} strokeWidth={1.5} /> Generate Incident
                  Report
                </>
              )}
            </button>
          )}
          <button
            className="btn btn-ghost"
            style={{ flex: 1, justifyContent: "center" }}
            onClick={onClose}
          >
            Close Crisis Room
          </button>
        </div>
      </div>
    </div>
  );
}
