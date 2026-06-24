import React, { useState, useEffect } from "react";
import { BarChart3, FileCode2, ShieldAlert, Zap, Activity } from "lucide-react";
import { fetchSummary, subscribeMonitor, fetchMonitorStatus } from "../api";
import * as tokenManager from "../tokenManager";
import HealthCard from "./HealthCard";

const SEV_COLORS = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)",
};

// Sparkline SVG component
function Sparkline({
  data,
  width = 360,
  height = 60,
  color = "var(--primary)",
}) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => [
    i * step,
    height - 4 - ((v - min) / range) * (height - 12),
  ]);
  const path = pts
    .map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`))
    .join(" ");
  const fillPath = `${path} L${width},${height} L0,${height} Z`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill="url(#spark-grad)" />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={pts[pts.length - 1][0]}
        cy={pts[pts.length - 1][1]}
        r="3"
        fill={color}
      />
    </svg>
  );
}

// Donut SVG component
function Donut({ segments, size = 120, thickness = 14 }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) return null;
  const r = size / 2;
  const inner = r - thickness;
  let acc = 0;
  const TAU = Math.PI * 2;
  const arc = (start, end, big) => {
    const sx = r + Math.sin(start) * r,
      sy = r - Math.cos(start) * r;
    const ex = r + Math.sin(end) * r,
      ey = r - Math.cos(end) * r;
    const isx = r + Math.sin(end) * inner,
      isy = r - Math.cos(end) * inner;
    const iex = r + Math.sin(start) * inner,
      iey = r - Math.cos(start) * inner;
    return `M${sx},${sy} A${r},${r} 0 ${big} 1 ${ex},${ey} L${isx},${isy} A${inner},${inner} 0 ${big} 0 ${iex},${iey} Z`;
  };
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {segments.map((s, i) => {
        const start = (acc / total) * TAU;
        acc += s.value;
        const end = (acc / total) * TAU;
        const big = end - start > Math.PI ? 1 : 0;
        return <path key={i} d={arc(start, end, big)} fill={s.color} />;
      })}
      <text
        x={r}
        y={r - 2}
        textAnchor="middle"
        fill="var(--text-1)"
        fontSize="22"
        fontWeight="600"
        fontFamily="DM Sans, system-ui, sans-serif"
      >
        {total}
      </text>
      <text
        x={r}
        y={r + 16}
        textAnchor="middle"
        fill="var(--text-3)"
        fontSize="10"
        fontFamily="DM Sans, system-ui, sans-serif"
        letterSpacing="0.14em"
      >
        FINDINGS
      </text>
    </svg>
  );
}

export default function SummaryTab({
  sessionId,
  enabled,
  repoName,
  findings,
  apiDocs,
  elapsedSec,
  isAnalyzing,
  health,
  repoUrl,
  ghToken,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [watching, setWatching] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [watchError, setWatchError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
  }, [sessionId]);

  useEffect(() => {
    if (!enabled || data || loading) return;
    setLoading(true);
    fetchSummary(sessionId)
      .then((d) => setData(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [enabled, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check if repo is already being watched
  useEffect(() => {
    if (!repoUrl || !enabled) return;
    const token = ghToken || tokenManager.get() || null;
    fetchMonitorStatus(token)
      .then((res) => {
        const watched = (res.repos || []).some((r) => r.repo_url === repoUrl);
        setWatching(watched);
      })
      .catch(() => {});
  }, [repoUrl, enabled, ghToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWatch = async () => {
    if (!repoUrl) return;
    const token = ghToken || tokenManager.get() || null;
    setWatchLoading(true);
    setWatchError(null);
    try {
      const data = await subscribeMonitor(repoUrl, {}, token);
      if (data.error) {
        setWatchError(data.error);
      } else {
        setWatching(true);
      }
    } catch (err) {
      setWatchError(err.message);
    } finally {
      setWatchLoading(false);
    }
  };

  if (!enabled && !isAnalyzing) {
    return (
      <div className="empty">
        <BarChart3 size={20} className="empty-icon" strokeWidth={1.5} />
        <div className="empty-title">Summary not available</div>
        <div className="empty-sub">Analyze a repository to get started</div>
      </div>
    );
  }

  if (isAnalyzing && !enabled) {
    return (
      <div className="summary">
        <span
          className="sk"
          style={{ height: 16, width: 220, marginBottom: 12, display: "block" }}
        />
        <span
          className="sk"
          style={{
            height: 14,
            width: "90%",
            marginBottom: 6,
            display: "block",
          }}
        />
        <span
          className="sk"
          style={{
            height: 14,
            width: "80%",
            marginBottom: 32,
            display: "block",
          }}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 14,
            marginBottom: 24,
          }}
        >
          <span className="sk" style={{ height: 180, display: "block" }} />
          <span className="sk" style={{ height: 180, display: "block" }} />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 14,
          }}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="sk"
              style={{ height: 100, display: "block" }}
            />
          ))}
        </div>
      </div>
    );
  }

  const nCritical = findings.filter(
    (f) => (f.severity || "").toLowerCase() === "critical",
  ).length;
  const nHigh = findings.filter(
    (f) => (f.severity || "").toLowerCase() === "high",
  ).length;
  const nMedium = findings.filter(
    (f) => (f.severity || "").toLowerCase() === "medium",
  ).length;
  const nLow = findings.length - nCritical - nHigh - nMedium;

  const donutSegments = [
    { value: nCritical, color: "var(--sev-critical)" },
    { value: nHigh, color: "var(--sev-high)" },
    { value: nMedium, color: "var(--sev-medium)" },
    { value: nLow, color: "var(--sev-low)" },
  ].filter((s) => s.value > 0);

  const sevSparkData = [nLow, nMedium, nHigh, nCritical].filter((_, i, a) =>
    a.some((v) => v > 0),
  );

  return (
    <div className="summary">
      <h2>Executive Summary</h2>
      <HealthCard health={health} />
      {enabled && repoUrl && (
        <div className="summary-watch">
          {watching ? (
            <span className="summary-watch-badge">
              <Activity size={12} />
              Watching
            </span>
          ) : (
            <button
              className="summary-watch-btn"
              onClick={handleWatch}
              disabled={watchLoading}
            >
              <Activity size={12} />
              {watchLoading ? "Subscribing…" : "Watch this repo"}
            </button>
          )}
          {watchError && (
            <span className="summary-watch-error">{watchError}</span>
          )}
        </div>
      )}
      {loading && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            color: "var(--text-3)",
            fontSize: 14,
            marginBottom: 24,
          }}
        >
          <span className="spinner" />
          Generating AI summary…
        </div>
      )}
      {error && (
        <p className="lead" style={{ color: "var(--danger)" }}>
          Failed to load summary: {error}
        </p>
      )}
      {data?.summary && <p className="lead">{data.summary}</p>}
      {!loading && !data && !error && (
        <p className="lead" style={{ color: "var(--text-3)" }}>
          Analysis of{" "}
          <strong style={{ color: "var(--text-1)" }}>{repoName}</strong>{" "}
          completed in {elapsedSec}s.
          {findings.length > 0
            ? ` Found ${findings.length} security ${findings.length === 1 ? "issue" : "issues"} and ${apiDocs.length} API endpoints.`
            : ` No security issues found. Detected ${apiDocs.length} API endpoints.`}
        </p>
      )}

      {/* Charts */}
      {(findings.length > 0 || apiDocs.length > 0) && (
        <div className="summary-charts">
          {/* Severity distribution — bars ordered low → critical */}
          <div className="chart-card">
            <div className="chart-card-head">
              <div>
                <div className="chart-title">FINDINGS BY SEVERITY</div>
                <div className="chart-value">{findings.length}</div>
                <div
                  className="chart-trend"
                  style={{ color: "var(--text-3)", gap: 4 }}
                >
                  <span style={{ fontSize: 11 }}>LOW → CRITICAL</span>
                  {[
                    nCritical && "critical",
                    nHigh && "high",
                    nMedium && "medium",
                    nLow && "low",
                  ]
                    .filter(Boolean)
                    .join(", ") || "none"}
                </div>
              </div>
            </div>
            {sevSparkData.length >= 2 && (
              <Sparkline
                data={sevSparkData}
                height={60}
                color="var(--sev-high)"
              />
            )}
          </div>

          {/* Donut card */}
          {findings.length > 0 && (
            <div className="chart-card">
              <div className="chart-title" style={{ marginBottom: 14 }}>
                SECURITY BREAKDOWN
              </div>
              <div className="donut-row">
                <Donut segments={donutSegments} size={110} thickness={13} />
                <div className="donut-legend">
                  {[
                    ["critical", nCritical],
                    ["high", nHigh],
                    ["medium", nMedium],
                    ["low", nLow],
                  ].map(
                    ([sev, count]) =>
                      count > 0 && (
                        <div key={sev} className="donut-legend-row">
                          <span>
                            <span
                              className="dot"
                              style={{ background: SEV_COLORS[sev] }}
                            />
                            {sev.charAt(0).toUpperCase() + sev.slice(1)}
                          </span>
                          <span className="n">{count}</span>
                        </div>
                      ),
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stat grid */}
      <div className="stat-grid">
        <div className="stat">
          <span className="stat-icon">
            <FileCode2 size={16} strokeWidth={1.5} />
          </span>
          <span className="stat-value">{apiDocs.length || 0}</span>
          <span className="stat-label">ENDPOINTS</span>
        </div>
        <div className="stat">
          <span className="stat-icon">
            <ShieldAlert size={16} strokeWidth={1.5} />
          </span>
          <span className="stat-value">{findings.length || 0}</span>
          <span className="stat-label">FINDINGS</span>
        </div>
        <div className="stat">
          <span className="stat-icon">
            <Zap size={16} strokeWidth={1.5} />
          </span>
          <span className="stat-value">
            {elapsedSec > 0 ? `${elapsedSec}s` : "—"}
          </span>
          <span className="stat-label">SCAN TIME</span>
        </div>
      </div>

      {/* Severity breakdown */}
      {findings.length > 0 && (
        <div>
          <div className="t-label" style={{ marginBottom: 12 }}>
            SECURITY BREAKDOWN
          </div>
          <div className="sev-breakdown">
            {[
              ["critical", nCritical],
              ["high", nHigh],
              ["medium", nMedium],
              ["low", nLow],
            ].map(
              ([sev, count]) =>
                count > 0 && (
                  <span key={sev}>
                    <span
                      className="sev-glyph"
                      style={{ background: SEV_COLORS[sev] }}
                    />
                    {count} {sev.charAt(0).toUpperCase() + sev.slice(1)}
                  </span>
                ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
