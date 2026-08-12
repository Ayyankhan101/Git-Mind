import React, { useState, useEffect, useRef } from "react";
import {
  BarChart3,
  FileCode2,
  ShieldAlert,
  Zap,
  Activity,
  ArrowUpRight,
} from "lucide-react";
import gsap from "gsap";
import { fs } from "../typeScale";
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

// 3D floating geometric shapes
function FloatingShapes() {
  const containerRef = useRef(null);

  useEffect(() => {
    const prefersReduced =
      window.matchMedia("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (prefersReduced || !containerRef.current) return;

    const shapes = containerRef.current.querySelectorAll(".float-shape");
    const ctx = gsap.context(() => {
      shapes.forEach((shape, i) => {
        gsap.to(shape, {
          y: `${8 + i * 3}`,
          rotationX: 360,
          rotationY: 180 + i * 60,
          duration: 12 + i * 4,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: i * 1.5,
        });
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div className="float-shapes-container" ref={containerRef}>
      <div
        className="float-shape float-octahedron"
        style={{ top: "10%", left: "5%" }}
      >
        <div className="float-shape-inner">
          <div className="float-face float-face-1" />
          <div className="float-face float-face-2" />
          <div className="float-face float-face-3" />
          <div className="float-face float-face-4" />
        </div>
      </div>
      <div
        className="float-shape float-cube"
        style={{ top: "60%", right: "8%", left: "auto" }}
      >
        <div className="float-shape-inner">
          <div className="float-face float-face-front" />
          <div className="float-face float-face-back" />
          <div className="float-face float-face-left" />
          <div className="float-face float-face-right" />
          <div className="float-face float-face-top" />
          <div className="float-face float-face-bottom" />
        </div>
      </div>
      <div
        className="float-shape float-ring"
        style={{ top: "30%", right: "15%", left: "auto" }}
      >
        <div className="float-shape-inner" />
      </div>
      <div
        className="float-shape float-pyramid"
        style={{ top: "70%", left: "15%" }}
      >
        <div className="float-shape-inner">
          <div className="float-face float-pyr-base" />
          <div className="float-face float-pyr-side-1" />
          <div className="float-face float-pyr-side-2" />
          <div className="float-face float-pyr-side-3" />
          <div className="float-face float-pyr-side-4" />
        </div>
      </div>
    </div>
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
  const statsRef = useRef(null);

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

  // GSAP entrance for stat cards
  useEffect(() => {
    if (!statsRef.current) return;
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
      <FloatingShapes />

      <div className="tab-header">
        <div className="tab-header-main">
          <span className="tab-header-icon">
            <BarChart3 size={15} strokeWidth={1.5} />
          </span>
          <div className="tab-header-text">
            <div className="tab-header-title">Executive Summary</div>
            <div className="tab-header-sub">{repoName}</div>
          </div>
        </div>
      </div>

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
            fontSize: fs.base,
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
      {/* Two-column grid: graph/bar (left) + summary (right) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
          width: "100%",
          alignItems: "start",
        }}
      >
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
                <FileCode2 size={20} strokeWidth={1.5} />
              </div>
              <span className="stat-value">{apiDocs.length || 0}</span>
              <span className="stat-label">ENDPOINTS</span>
              <span className="stat-trend">
                <ArrowUpRight size={12} /> detected
              </span>
            </div>
            <div className="stat">
              <div className="stat-icon-wrap stat-icon--warn">
                <ShieldAlert size={20} strokeWidth={1.5} />
              </div>
              <span className="stat-value">{findings.length || 0}</span>
              <span className="stat-label">FINDINGS</span>
              <span className="stat-trend stat-trend--danger">
                <ArrowUpRight size={12} /> security
              </span>
            </div>
            <div className="stat">
              <div className="stat-icon-wrap stat-icon--ok">
                <Zap size={20} strokeWidth={1.5} />
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
        </div>
      </div>
    </div>
  );
}
