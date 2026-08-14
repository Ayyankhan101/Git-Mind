import React, { useState, useEffect, useRef } from "react";
import { fs } from "../typeScale";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { X, FileText, AlertTriangle, Copy, Check as CheckIcon } from "../icons";
import { WS_BASE, fetchIncidentReport } from "../api";
import { Download } from "../icons";

const ROLE_COLOR = {
  CEO: "var(--warning)",
  Legal: "var(--info)",
  Engineering: "var(--success)",
  Reporter: "var(--danger)",
};
const WS_URL = `${WS_BASE}/ws/crisis`;
const REPORTER_INTERVAL = 45;

export default function CrisisChat({ finding, sessionId, onClose, repoName }) {
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
  const trapRef = useFocusTrap(true);

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
            color: ROLE_COLOR[data.agent] || "var(--text-3)",
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

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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

  const handleExportPdf = async () => {
    if (!report) return;
    try {
      const { buildIncidentPdf, downloadPdf, sanitizeFilename } =
        await import("../pdfBuilder");
      const outcome = resolved ? "resolved" : "leaked";
      const docDef = buildIncidentPdf({ report, finding, outcome, repoName });
      downloadPdf(
        docDef,
        `gitmind-incident-${sanitizeFilename(repoName || "report")}-${Date.now()}.pdf`,
      );
    } catch (err) {
      setReportError(err.message || "PDF export failed.");
    }
  };

  return (
    <div
      className="crisis-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="crisis-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Crisis simulation"
        ref={trapRef}
      >
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
            aria-label="Close crisis simulation"
          >
            <X size={14} />
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
            ["Reporter", ROLE_COLOR.Reporter],
          ].map(([role, color]) => (
            <div
              key={role}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: fs.xs,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-3)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 0,
                  background: color,
                  flexShrink: 0,
                }}
              />
              {role}
            </div>
          ))}
        </div>

        {/* Messages */}
        <div className="crisis-body" aria-live="polite">
          {error && (
            <div
              style={{
                padding: "12px 14px",
                background: "var(--danger-bg)",
                border: "1px solid var(--danger)",
                borderRadius: 0,
                fontSize: fs.sm,
                color: "var(--danger)",
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
              <div style={{ color: "var(--text-3)", fontSize: fs.md }}>
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
                background: "var(--success-bg)",
                border: "1px solid var(--success)",
                borderRadius: 0,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: fs.base,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--success)",
                  marginBottom: 4,
                }}
              >
                Incident Contained
              </div>
              <div style={{ fontSize: fs.sm, color: "var(--text-3)" }}>
                Team issued statement before reporter published.
              </div>
            </div>
          )}

          {leaked && (
            <div
              style={{
                padding: "16px",
                background: "var(--danger-bg)",
                border: "1px solid var(--danger)",
                borderRadius: 0,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: fs.base,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--danger)",
                  marginBottom: 4,
                }}
              >
                BREAKING: Reporter Published
              </div>
              <div style={{ fontSize: fs.sm, color: "var(--text-3)" }}>
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
                background: "var(--surface)",
                borderRadius: 0,
                border: "1px solid var(--border-m)",
              }}
            >
              <div
                style={{
                  fontSize: fs.xs,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.1em",
                  color: "var(--text-3)",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <FileText size={11} />
                INCIDENT REPORT
                <button
                  onClick={handleExportPdf}
                  aria-label="Export incident report PDF"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-3)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: fs.xs,
                    padding: "2px 6px",
                    borderRadius: 0,
                  }}
                >
                  <Download size={10} /> Export PDF
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(report).then(() => {
                      setReportCopied(true);
                      setTimeout(() => setReportCopied(false), 2000);
                    });
                  }}
                  aria-label="Copy incident report"
                  style={{
                    marginLeft: "auto",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: reportCopied ? "var(--success)" : "var(--text-3)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: fs.xs,
                    padding: "2px 6px",
                    borderRadius: 0,
                  }}
                >
                  {reportCopied ? <CheckIcon size={10} /> : <Copy size={10} />}
                  {reportCopied ? "Copied" : "Copy"}
                </button>
              </div>
              <pre
                style={{
                  fontSize: fs.sm,
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
                background: "var(--danger-bg)",
                borderRadius: 0,
                fontSize: fs.sm,
                color: "var(--danger)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <AlertTriangle size={11} /> {reportError}
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
                  <FileText size={13} /> Generate Incident Report
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
