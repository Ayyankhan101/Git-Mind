import React from "react";

export function SkeletonLine({ width = "100%", height = 14, style }) {
  return (
    <div
      className="sk-line"
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}

export function SkeletonBlock({ width = "100%", height = 80, style }) {
  return (
    <div
      className="sk-block"
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({ lines = 3, style }) {
  return (
    <div className="sk-card" style={style} aria-hidden="true">
      <SkeletonLine width="40%" height={16} />
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonLine
          key={i}
          width={i === lines - 1 ? "60%" : "100%"}
          height={12}
        />
      ))}
    </div>
  );
}

export default function Skeleton({ variant = "card", count = 1, style }) {
  const variants = {
    card: SkeletonCard,
    line: SkeletonLine,
    block: SkeletonBlock,
  };
  const Component = variants[variant] || SkeletonCard;

  return (
    <div className="skeleton-wrap" role="status" aria-label="Loading" style={style}>
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }, (_, i) => (
        <Component key={i} />
      ))}
    </div>
  );
}
