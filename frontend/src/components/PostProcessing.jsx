import React from "react";
import * as THREE from "three";

/**
 * Post-processing effects (bloom, vignette).
 * Uses CSS for simplicity - no heavy Three.js post-processing deps.
 */
export default function PostProcessing({ enabled = true }) {
  if (!enabled) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
        background:
          "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)",
        mixBlendMode: "multiply",
      }}
    />
  );
}
