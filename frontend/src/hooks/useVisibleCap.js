import { useState, useCallback, useEffect } from "react";

/**
 * Caps long lists behind a "Show more" button instead of rendering
 * hundreds of rows up front (Web Interface Guidelines: virtualize or
 * cap >50-item lists). Count state survives filter changes; Math.min
 * keeps `visible` within bounds.
 */
export function useVisibleCap(total, step = 50, resetKey = null) {
  const [count, setCount] = useState(step);
  // New filter/subset → back to the first page instead of leaking the
  // expanded count into unrelated rows.
  useEffect(() => {
    setCount(step);
  }, [resetKey, step]);
  const visible = Math.min(count, total);
  const hasMore = total > visible;
  const showMore = useCallback(() => setCount((c) => c + step), [step]);
  return { visible, hasMore, showMore, remaining: total - visible };
}

export function ShowMoreButton({ onClick, remaining, step = 50 }) {
  return (
    <button
      className="btn btn-ghost"
      style={{ margin: "12px auto", display: "block" }}
      onClick={onClick}
    >
      Show more… ({Math.min(remaining, step)} of {remaining} hidden)
    </button>
  );
}
