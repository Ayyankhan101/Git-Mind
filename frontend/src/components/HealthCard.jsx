import React, { useEffect, useRef } from "react";

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
    el.style.width = "0%";
    const timer = setTimeout(() => {
      el.style.width = `${value}%`;
    }, 100 + delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.06)",
        borderRadius: 4,
        height: 8,
        width: "100%",
        overflow: "hidden",
      }}
    >
      <div
        ref={ref}
        style={{
          background: `linear-gradient(90deg, ${color}, ${color}dd)`,
          height: "100%",
          borderRadius: 4,
          transition: "width 0.8s cubic-bezier(0.22, 1, 0.36, 1)",
          boxShadow: `0 0 8px ${color}44`,
        }}
      />
    </div>
  );
}

export default function HealthCard({ health }) {
  if (!health) return null;
  const gradeColor = GRADE_COLOR[health.grade] || "var(--text-3)";

  return (
    <div className="health-card">
      {/* Glow backdrop */}
      <div
        className="health-card-glow"
        style={{
          background: `radial-gradient(circle at 30% 50%, ${gradeColor}18, transparent 60%)`,
        }}
      />

      <div className="health-card-inner">
        {/* Grade ring */}
        <div className="health-grade-ring">
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
              stroke="rgba(255,255,255,0.06)"
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
            <span className="health-grade-letter" style={{ color: gradeColor }}>
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
