import React from "react";

const GRADE_COLOR = {
  A: "#10b981",
  B: "#34d399",
  C: "#f59e0b",
  D: "#f97316",
  F: "#ef4444",
};

const DIM_LABEL = {
  security: "Security",
  documentation: "Docs",
  api_coverage: "API Coverage",
  dependency_freshness: "Dep Freshness",
  code_quality: "Code Quality",
};

function MiniBar({ value, color }) {
  return (
    <div
      style={{
        background: "var(--surface-2)",
        borderRadius: 3,
        height: 5,
        width: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: color,
          width: `${value}%`,
          height: "100%",
          borderRadius: 3,
          transition: "width 0.6s ease",
        }}
      />
    </div>
  );
}

export default function HealthCard({ health }) {
  if (!health) return null;
  const gradeColor = GRADE_COLOR[health.grade] || "#94a3b8";

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "18px 22px",
        marginBottom: 24,
        background: "var(--surface)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            border: `3px solid ${gradeColor}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: gradeColor,
              lineHeight: 1,
            }}
          >
            {health.grade}
          </span>
          <span
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              letterSpacing: "0.1em",
            }}
          >
            {health.score}/100
          </span>
        </div>

        <div style={{ flex: 1, display: "grid", gap: 10 }}>
          {Object.entries(health.breakdown).map(([key, val]) => (
            <div key={key}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "var(--text-3)",
                  marginBottom: 4,
                }}
              >
                <span>{DIM_LABEL[key] || key}</span>
                <span
                  style={{
                    color:
                      val >= 80 ? "#10b981" : val >= 60 ? "#f59e0b" : "#ef4444",
                    fontWeight: 600,
                  }}
                >
                  {val}
                </span>
              </div>
              <MiniBar
                value={val}
                color={
                  val >= 80 ? "#10b981" : val >= 60 ? "#f59e0b" : "#ef4444"
                }
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
