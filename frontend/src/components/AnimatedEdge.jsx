import React from "react";
import { BaseEdge, getBezierPath, EdgeLabelRenderer } from "@xyflow/react";

function hashString(s) {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildStyleDefs(kind) {
  if (kind === "solid") return { strokeDasharray: "none", className: "" };
  if (kind === "dashed") return { strokeDasharray: "8, 4", className: "" };
  if (kind === "dotted") return { strokeDasharray: "2, 4", className: "" };
  return {
    strokeDasharray: "10, 10",
    className: "animate-[dash_2s_linear_infinite]",
  };
}

export default function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
}) {
  const kind = data?.kind || "solid";
  const isDimmed = data?.isDimmed || false;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const labelYOffset = (hashString(id || label || "") % 25) - 12;

  const styleConfig = buildStyleDefs(kind);
  const opacity = isDimmed ? 0.12 : 1;

  const baseStroke = "stroke-slate-500";
  const glowStroke = "stroke-cyan-400/50";

  return (
    <g
      style={{
        animation: "edgeFadeIn 0.4s ease-out both",
        animationDelay: "0.1s",
      }}
    >
      <defs>
        <marker
          id={`arrowhead-${id}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--info)" />
        </marker>
      </defs>

      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          strokeWidth: kind === "solid" ? 2.5 : 2,
          strokeDasharray: styleConfig.strokeDasharray,
          opacity,
          transition: "opacity 0.25s ease",
        }}
        className={`${baseStroke} ${styleConfig.className}`}
        markerEnd={`url(#arrowhead-${id})`}
      />

      <path
        d={edgePath}
        fill="none"
        strokeWidth={kind === "animated" ? 2 : 0}
        opacity={kind === "animated" ? opacity : 0}
        className={glowStroke}
        strokeDasharray={styleConfig.strokeDasharray}
        style={{ transition: "opacity 0.25s ease" }}
      />

      <path d={edgePath} fill="none" stroke="none">
        <circle
          r={kind === "animated" ? 4 : 0}
          fill="var(--info)"
          opacity={kind === "animated" ? opacity : 0}
          style={{ transition: "opacity 0.25s ease" }}
        >
          <animateMotion dur="3s" repeatCount="indefinite" path={edgePath} />
        </circle>
      </path>

      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY + labelYOffset}px)`,
              pointerEvents: "none",
              opacity,
              transition: "opacity 0.25s ease",
            }}
            className="px-2 py-0.5 rounded text-[11px] font-mono tracking-wide font-medium bg-slate-950/70 border border-slate-800/60 text-slate-400 backdrop-blur-sm shadow-md whitespace-nowrap"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}
