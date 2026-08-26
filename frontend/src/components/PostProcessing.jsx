import React from "react";

/**
 * Post-processing vignette for the dashboard 3D background.
 * - Rendered between the scene canvas (z0) and the content wrapper
 *   (z1) in App.jsx — DOM order puts it under ALL dashboard UI.
 * - Color/strength come from --vignette-* tokens; light themes disable
 *   it entirely via the [data-theme] guards below.
 */
export default function PostProcessing({ enabled = true }) {
  if (!enabled) return null;
  return <div className="vignette-overlay" aria-hidden="true" />;
}
