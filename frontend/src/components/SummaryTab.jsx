import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  BarChart3,
  FileCode2,
  ShieldAlert,
  Zap,
  Activity,
  ArrowUpRight,
  Download,
} from "../icons";
import gsap from "gsap";
import { fs } from "../typeScale";
import { fetchSummary, subscribeMonitor, fetchMonitorStatus } from "../api";
import * as tokenManager from "../tokenManager";
import HealthCard from "./HealthCard";
import SceneManager from "./SceneManager";
import SummaryScene from "./SummaryScene";

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
  color = "var(--accent)",
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
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill="url(#spark-grad)" />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={pts[pts.length - 1][0]}
        cy={pts[pts.length - 1][1]}
        r="3.5"
        fill={color}
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
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
        return (
          <path
            key={i}
            d={arc(start, end, big)}
            fill={s.color}
            style={{ filter: `drop-shadow(0 0 4px ${s.color}66)` }}
          />
        );
      })}
      <text
        x={r}
        y={r - 2}
        textAnchor="middle"
        fill="var(--text-1)"
        fontSize="22"
        fontWeight="600"
        fontFamily="var(--font-sans)"
      >
        {total}
      </text>
      <text
        x={r}
        y={r + 16}
        textAnchor="middle"
        fill="var(--text-3)"
        fontSize="10"
        fontFamily="var(--font-sans)"
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
  agentStatus,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [watching, setWatching] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [watchError, setWatchError] = useState(null);
  const statsRef = useRef(null);

  const fetchSummaryData = useCallback(
    (attempt = 0) => {
      if (!enabled || data) return;
      setLoading(true);
      setError(null);
      let cancelled = false;
      const MAX_RETRIES = 3;
      const RETRY_DELAY = 5000;
      async function tryFetch(a) {
        try {
          const d = await fetchSummary(sessionId);
          if (!cancelled) setData(d);
        } catch (err) {
          if (!cancelled && a < MAX_RETRIES) {
            setTimeout(() => tryFetch(a + 1), RETRY_DELAY);
            return;
          }
          if (!cancelled) setError(err.message);
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
      tryFetch(attempt);
      return () => {
        cancelled = true;
      };
    },
    [enabled, sessionId, data],
  );

  useEffect(() => {
    setData(null);
    setError(null);
  }, [sessionId]);

  useEffect(() => {
    if (!enabled || data || loading) return;
    return fetchSummaryData(0);
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

  // GSAP entrance for stat cards
  useEffect(() => {
    if (!statsRef.current) return;
    // CSS kill-switches can't stop JS tweens — skip the entrance entirely
    // for reduced-motion users (cards stay visible at full opacity).
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cards = statsRef.current.querySelectorAll(".stat");
    gsap.fromTo(
      cards,
      { opacity: 0, y: 24, scale: 0.96 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.5,
        stagger: 0.1,
        ease: "power3.out",
        delay: 0.3,
      },
    );
  }, [enabled]);

  const handleExportPdf = async () => {
    try {
      const { buildSummaryPdf, downloadPdf, sanitizeFilename } =
        await import("../pdfBuilder");
      const docDef = buildSummaryPdf({
        repoName,
        summary: data?.summary,
        stats: data?.stats,
        health,
        elapsedSec,
      });
      downloadPdf(
        docDef,
        `gitmind-summary-${sanitizeFilename(repoName)}-${Date.now()}.pdf`,
      );
    } catch (err) {
      console.error("Summary export failed", err);
    }
  };

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
        <BarChart3 size={20} className="empty-icon" />
        <div className="empty-title">Summary not available</div>
        <div className="empty-sub">Load a repository to run an analysis</div>
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
        <div className="summary-grid" style={{ marginBottom: 24 }}>
          <span className="sk" style={{ height: 180, display: "block" }} />
          <span className="sk" style={{ height: 180, display: "block" }} />
        </div>
        <div className="stat-grid">
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
      <SceneManager
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
        }}
      >
        {({ sceneRef, subscribe, prefersReduced }) => (
          <SummaryScene
            sceneRef={sceneRef}
            subscribe={subscribe}
            prefersReduced={prefersReduced}
          />
        )}
      </SceneManager>

      <div className="tab-header">
        <div className="tab-header-main">
          <span className="tab-header-icon">
            <BarChart3 size={15} />
          </span>
          <div className="tab-header-text">
            <div className="tab-header-eyebrow">01 — Summary</div>
            <div className="tab-header-title">Executive Summary</div>
            <div className="tab-header-sub">{repoName}</div>
          </div>
        </div>
        <button
          className="btn btn-ghost"
          onClick={handleExportPdf}
          disabled={!data}
          style={{ marginLeft: "auto", alignSelf: "center" }}
          title="Export summary PDF"
          aria-label="Export summary PDF"
        >
          <Download size={13} /> Export PDF
        </button>
      </div>

      {/* Editorial band variant: the grade card mirrors the landing
          stats-band treatment (--primary-strong fill, on-primary type). */}
      <HealthCard health={health} variant="band" />

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
      {!enabled && isAnalyzing && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            color: "var(--text-3)",
            fontSize: fs.base,
            marginBottom: 24,
          }}
        >
          <span className="spinner" />
          Waiting for analysis to complete…
        </div>
      )}
      {loading && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            color: "var(--text-3)",
            fontSize: fs.base,
            marginBottom: 24,
          }}
        >
          <span className="spinner" />
          Generating AI summary…
        </div>
      )}
      {error && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            color: "var(--danger)",
            fontSize: fs.base,
            marginBottom: 24,
          }}
        >
          <p className="lead" style={{ margin: 0 }}>
            Failed to load summary: {error}
          </p>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setData(null);
              setError(null);
              fetchSummaryData(0);
            }}
            style={{ flexShrink: 0 }}
          >
            Retry
          </button>
        </div>
      )}
      {/* Two-column grid: graph/bar (left) + summary (right) */}
      <div className="summary-grid">
        {/* Left Card — Findings & Metrics (graph/bar) */}
        <div className="summary-card">
          {/* FINDINGS BY SEVERITY */}
          {(findings.length > 0 || apiDocs.length > 0) && (
            <div className="chart-card-head">
              <div>
                <div className="chart-title">FINDINGS BY SEVERITY</div>
                <div className="chart-value">{findings.length}</div>
                <div
                  className="chart-trend"
                  style={{ color: "var(--text-3)", gap: 4 }}
                >
                  <span style={{ fontSize: fs.xs }}>LOW → CRITICAL</span>
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
          )}
          {sevSparkData.length >= 2 && (
            <Sparkline
              data={sevSparkData}
              height={60}
              color="var(--sev-high)"
            />
          )}

          {/* SECURITY BREAKDOWN donut */}
          {findings.length > 0 && (
            <>
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
            </>
          )}

          {/* Stat grid */}
          <div className="stat-grid" ref={statsRef}>
            <div className="stat">
              <div className="stat-icon-wrap">
                <FileCode2 size={20} />
              </div>
              <span className="stat-value">{apiDocs.length || 0}</span>
              <span className="stat-label">ENDPOINTS</span>
              <span className="stat-trend">
                <ArrowUpRight size={12} /> detected
              </span>
            </div>
            <div className="stat">
              <div className="stat-icon-wrap stat-icon--warn">
                <ShieldAlert size={20} />
              </div>
              <span className="stat-value">{findings.length || 0}</span>
              <span className="stat-label">FINDINGS</span>
              <span className="stat-trend stat-trend--danger">
                <ArrowUpRight size={12} /> security
              </span>
            </div>
            <div className="stat">
              <div className="stat-icon-wrap stat-icon--ok">
                <Zap size={20} />
              </div>
              <span className="stat-value">
                {elapsedSec > 0 ? `${elapsedSec}s` : "—"}
              </span>
              <span className="stat-label">SCAN TIME</span>
              <span className="stat-trend stat-trend--ok">
                <ArrowUpRight size={12} /> fast
              </span>
            </div>
          </div>
        </div>

        {/* Right Card — Repository Description (summary text) */}
        <div className="summary-card">
          {data?.summary &&
            (() => {
              // Strip <think>...</think> thinking tags that some LLMs emit
              const clean = data.summary
                .replace(/<think>[\s\S]*?<\/think>/g, "")
                .trim();
              return (
                <div
                  className="lead"
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  {clean
                    .split(/(?<=[.!?])\s+/)
                    .filter(Boolean)
                    .map((sentence, i) => (
                      <p key={i} style={{ margin: 0, lineHeight: 1.65 }}>
                        {sentence.trim()}
                      </p>
                    ))}
                </div>
              );
            })()}
          {!loading && !data && !error && !isAnalyzing && (
            <p className="lead" style={{ color: "var(--text-3)" }}>
              Analysis of{" "}
              <strong style={{ color: "var(--text-1)" }}>{repoName}</strong>{" "}
              completed in {elapsedSec}s.
              {findings.length > 0
                ? ` Found ${findings.length} security ${findings.length === 1 ? "issue" : "issues"} and ${apiDocs.length} API endpoints.`
                : ` No security issues found. Detected ${apiDocs.length} API endpoints.`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
