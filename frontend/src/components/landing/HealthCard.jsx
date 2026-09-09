import React, { useEffect, useRef } from "react";
import ErrorBoundary from "../ErrorBoundary";
import SceneManager from "../scene/SceneManager";
import HealthGauge3D from "../scene/HealthGauge3D";

const GRADE_COLOR = {
  A: "var(--success)",
  B: "var(--success)",
  C: "var(--warning)",
  D: "var(--warning)",
  F: "var(--danger)",
};

const DIM_LABEL = {
  security: "Security",
  documentation: "Docs",
  api_coverage: "API Coverage",
  dependency_freshness: "Dep Freshness",
  code_quality: "Code Quality",
};

function MiniBar({ value, color, delay = 0 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    el.style.transform = "scaleX(0)";
    const timer = setTimeout(() => {
      el.style.transform = `scaleX(${value / 100})`;
    }, 100 + delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return (
    <div
      style={{
        /* --health-track lets the editorial band variant retune the
           track to on-primary without touching the default surface. */
        background: "var(--health-track, var(--border-s))",
        borderRadius: 4,
        height: 8,
        width: "100%",
        overflow: "hidden",
      }}
    >
      <div
        ref={ref}
        style={{
          // Fill spans the full track; the visible portion is driven by
          // transform scaleX (compositor-friendly) instead of width.
          background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 85%, #000))`,
          width: "100%",
          height: "100%",
          transformOrigin: "left center",
          transform: "scaleX(0)",
          borderRadius: 4,
          transition: "transform 0.8s cubic-bezier(0.22, 1, 0.36, 1)",
          boxShadow: `0 0 8px color-mix(in srgb, ${color} 30%, transparent)`,
        }}
      />
    </div>
  );
}

export default function HealthCard({ health, variant, static: isStatic }) {
  if (!health) return null;
  const gradeColor = GRADE_COLOR[health.grade] || "var(--text-3)";
  /* "band": the editorial stats-band treatment (--primary-strong fill,
     on-primary type) used on the dashboard grade card. */
  const isBand = variant === "band";

  return (
    <div
      className={`health-card${isBand ? " health-card--band" : ""}`}
      data-testid="health-card"
    >
      {/* Glow backdrop */}
      <div
        className="health-card-glow"
        style={{
          // `var(--x)18` alpha-suffix is invalid CSS (dropped -> glow never
          // painted); use color-mix so the glow is theme-aware like the
          // float shapes.
          background: `radial-gradient(circle at 30% 50%, color-mix(in srgb, ${gradeColor} 10%, transparent), transparent 60%)`,
        }}
      />

      <div className="health-card-inner">
        {/* Grade ring */}
        <div className="health-grade-ring">
          {/* static variant (landing sample card) skips WebGL — no
              context boot for decorative preview content. */}
          {/* fallback={null}: the SVG ring below still shows the score on
              its own, so a WebGL failure here should just skip the 3D
              gauge overlay, not cascade up and take the whole tab down. */}
          {!isStatic && (
            <ErrorBoundary fallback={null}>
              <SceneManager
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 1,
                  pointerEvents: "none",
                }}
              >
                {({ sceneRef, subscribe, prefersReduced }) => (
                  <HealthGauge3D
                    sceneRef={sceneRef}
                    subscribe={subscribe}
                    score={health.score}
                    prefersReduced={prefersReduced}
                  />
                )}
              </SceneManager>
            </ErrorBoundary>
          )}
          <svg
            viewBox="0 0 96 96"
            width="96"
            height="96"
            className="health-ring-svg"
          >
            <defs>
              <linearGradient id="health-ring-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={gradeColor} stopOpacity="0.3" />
                <stop offset="100%" stopColor={gradeColor} stopOpacity="1" />
              </linearGradient>
            </defs>
            <circle
              cx="48"
              cy="48"
              r="42"
              fill="none"
              stroke="var(--health-track, var(--border-s))"
              strokeWidth="4"
            />
            <circle
              cx="48"
              cy="48"
              r="42"
              fill="none"
              stroke="url(#health-ring-grad)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${(health.score / 100) * 263.9} 263.9`}
              transform="rotate(-90 48 48)"
              className="health-ring-progress"
            />
          </svg>
          <div className="health-grade-text">
            <span
              className="health-grade-letter"
              style={{
                /* Band mode drops the semantic grade color for on-primary
                   (the ring arc still carries the grade color). */
                color: isBand ? "var(--text-on-primary)" : gradeColor,
              }}
            >
              {health.grade}
            </span>
            <span className="health-grade-score">{health.score}/100</span>
          </div>
        </div>

        {/* Breakdown bars */}
        <div className="health-breakdown">
          {Object.entries(health.breakdown).map(([key, val], i) => (
            <div key={key} className="health-bar-row">
              <div className="health-bar-label">
                <span>{DIM_LABEL[key] || key}</span>
                <span
                  className="health-bar-value"
                  style={{
                    color:
                      val >= 80
                        ? "var(--success)"
                        : val >= 60
                          ? "var(--warning)"
                          : "var(--danger)",
                  }}
                >
                  {val}
                </span>
              </div>
              <MiniBar
                value={val}
                color={
                  val >= 80
                    ? "var(--success)"
                    : val >= 60
                      ? "var(--warning)"
                      : "var(--danger)"
                }
                delay={i * 80}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
