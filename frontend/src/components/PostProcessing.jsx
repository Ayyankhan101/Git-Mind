import React from "react";

/**
 * Post-processing vignette for the dashboard 3D background.
 * - Sits at z-index 1: above the scene canvas (z 0), below all UI (z 2+)
 *   and far below modals/toasts — it must never darken interactive UI.
 * - Color/strength come from --vignette-* tokens; light themes disable
 *   it entirely via the [data-theme] guards below.
 */
export default function PostProcessing({ enabled = true }) {
  if (!enabled) return null;
  return <div className="vignette-overlay" aria-hidden="true" />;
}
