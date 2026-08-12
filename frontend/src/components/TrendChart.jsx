import { useState } from "react";
import { fs } from "../typeScale";
import { GRADE_COLOR } from "../constants";

const DIM_KEYS = [
  "security",
  "documentation",
  "api_coverage",
  "dependency_freshness",
  "code_quality",
];
const DIM_LABELS = {
  security: "Security",
  documentation: "Docs",
  api_coverage: "API Coverage",
  dependency_freshness: "Dep Freshness",
  code_quality: "Code Quality",
};
const DIM_COLORS = {
  security: "var(--danger)",
  documentation: "var(--primary)",
  api_coverage: "var(--info)",
  dependency_freshness: "var(--warning)",
  code_quality: "var(--success)",
};

function getGrade(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function formatDate(ts) {
  const d = new Date(ts * 1000);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateFull(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const PADDING = { top: 20, right: 20, bottom: 30, left: 40 };

export default function TrendChart({ data, days, onDaysChange }) {
  const [showDetails, setShowDetails] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(null);

  if (!data || data.length < 2) {
    return (
      <div
        style={{
          padding: 16,
          textAlign: "center",
          color: "var(--text-3)",
          fontSize: fs.md,
        }}
      >
        {data?.length === 1
          ? "Need at least 2 analyses for a trend"
          : "Analyze this repo to see trends"}
      </div>
    );
  }

  const width = 480;
  const height = 200;
  const chartW = width - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;

  const scores = data.map((d) => d.health?.score ?? 0);
  const minScore = Math.max(0, Math.min(...scores) - 10);
  const maxScore = Math.min(100, Math.max(...scores) + 10);

  const xScale = (i) => PADDING.left + (i / (data.length - 1)) * chartW;
  const yScale = (v) =>
    PADDING.top + chartH - ((v - minScore) / (maxScore - minScore)) * chartH;

  const mainPoints = data
    .map((d, i) => `${xScale(i)},${yScale(d.health?.score ?? 0)}`)
    .join(" ");

  const dimLines = {};
  if (showDetails) {
    for (const key of DIM_KEYS) {
      dimLines[key] = data
        .map((d, i) => {
          const val = d.health?.breakdown?.[key];
          if (val == null) return null;
          return `${xScale(i)},${yScale(val)}`;
        })
        .filter(Boolean)
        .join(" ");
    }
  }

  const hovered = hoverIdx != null ? data[hoverIdx] : null;
  const hoveredScore = hovered?.health?.score;
  const hoveredGrade = hovered ? getGrade(hoveredScore) : null;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: fs.xs,
            fontWeight: 600,
            color: "var(--text-2)",
            letterSpacing: "0.05em",
          }}
        >
          HEALTH TREND
        </span>
        <div style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
          {[7, 30, 0].map((d) => (
            <button
              key={d}
              onClick={() => onDaysChange?.(d)}
              style={{
                padding: "2px 8px",
                fontSize: fs.xs,
                borderRadius: 4,
                border: "none",
                cursor: "pointer",
                fontWeight: days === d ? 600 : 400,
                background: days === d ? "var(--primary)" : "var(--surface-2)",
                color: days === d ? "var(--text-1)" : "var(--text-3)",
              }}
            >
              {d === 0 ? "All" : `${d}d`}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowDetails((v) => !v)}
          style={{
            padding: "2px 8px",
            fontSize: fs.xs,
            borderRadius: 4,
            border: "1px solid var(--border-2)",
            background: "transparent",
            color: "var(--text-3)",
            cursor: "pointer",
          }}
        >
          {showDetails ? "Hide Details" : "Details"}
        </button>
      </div>

      <svg
        role="img"
        aria-label="Health score trend over time"
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto" }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {[0, 25, 50, 75, 100].map((v) => {
          if (v < minScore || v > maxScore) return null;
          const y = yScale(v);
          return (
            <g key={v}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={width - PADDING.right}
                y2={y}
                stroke="var(--border-2)"
                strokeWidth={0.5}
              />
              <text
                x={PADDING.left - 6}
                y={y + 3}
                textAnchor="end"
                fill="var(--text-3)"
                fontSize={fs.tiny}
              >
                {v}
              </text>
            </g>
          );
        })}

        {data.length <= 10
          ? data.map((d, i) => (
              <text
                key={i}
                x={xScale(i)}
                y={height - 6}
                textAnchor="middle"
                fill="var(--text-3)"
                fontSize={fs.tiny}
              >
                {formatDate(d.saved_at)}
              </text>
            ))
          : data
              .filter(
                (_, i) =>
                  i % Math.ceil(data.length / 8) === 0 || i === data.length - 1,
              )
              .map((d, _, arr) => {
                const i = data.indexOf(d);
                return (
                  <text
                    key={i}
                    x={xScale(i)}
                    y={height - 6}
                    textAnchor="middle"
                    fill="var(--text-3)"
                    fontSize={fs.tiny}
                  >
                    {formatDate(d.saved_at)}
                  </text>
                );
              })}

        {showDetails &&
          Object.entries(dimLines).map(([key, pts]) => (
            <polyline
              key={key}
              data-testid="trend-line-dim"
              points={pts}
              fill="none"
              stroke={DIM_COLORS[key]}
              strokeWidth={1}
              opacity={0.4}
            />
          ))}

        <polyline
          data-testid="trend-line-main"
          points={mainPoints}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2}
        />

        {data.map((d, i) => {
          const score = d.health?.score ?? 0;
          const grade = getGrade(score);
          const isHovered = hoverIdx === i;
          return (
            <circle
              key={i}
              data-testid="trend-point"
              cx={xScale(i)}
              cy={yScale(score)}
              r={isHovered ? 5 : 3}
              fill={GRADE_COLOR[grade]}
              stroke="var(--surface-1)"
              strokeWidth={1.5}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHoverIdx(i)}
            />
          );
        })}

        {hovered && (
          <g>
            <rect
              x={Math.min(
                Math.max(xScale(hoverIdx) - 60, PADDING.left),
                width - PADDING.right - 120,
              )}
              y={PADDING.top - 4}
              width={120}
              height={52}
              rx={4}
              fill="var(--surface-2)"
              stroke="var(--border-2)"
              strokeWidth={0.5}
            />
            <text
              x={Math.min(
                Math.max(xScale(hoverIdx), PADDING.left + 10),
                width - PADDING.right - 10,
              )}
              y={PADDING.top + 14}
              textAnchor="middle"
              fill="var(--text-1)"
              fontSize={fs.xs}
              fontWeight={600}
            >
              {hoveredScore}/100 ({hoveredGrade})
            </text>
            <text
              x={Math.min(
                Math.max(xScale(hoverIdx), PADDING.left + 10),
                width - PADDING.right - 10,
              )}
              y={PADDING.top + 28}
              textAnchor="middle"
              fill="var(--text-3)"
              fontSize={fs.tiny}
            >
              {formatDateFull(hovered.saved_at)}
            </text>
            <text
              x={Math.min(
                Math.max(xScale(hoverIdx), PADDING.left + 10),
                width - PADDING.right - 10,
              )}
              y={PADDING.top + 42}
              textAnchor="middle"
              fill="var(--text-3)"
              fontSize={fs.tiny}
            >
              {(hovered.head_sha || "").slice(0, 7)}
            </text>
          </g>
        )}
      </svg>

      {showDetails && (
        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 6,
            flexWrap: "wrap",
            paddingLeft: PADDING.left,
          }}
        >
          <span
            style={{
              fontSize: fs.micro,
              color: "var(--text-3)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span
              style={{
                width: 12,
                height: 2,
                background: "var(--primary)",
                display: "inline-block",
              }}
            />
            Total
          </span>
          {DIM_KEYS.map((key) => (
            <span
              key={key}
              style={{
                fontSize: fs.micro,
                color: "var(--text-3)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 2,
                  background: DIM_COLORS[key],
                  display: "inline-block",
                  opacity: 0.6,
                }}
              />
              {DIM_LABELS[key]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
