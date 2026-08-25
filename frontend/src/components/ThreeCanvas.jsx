import React, { useRef, useEffect } from "react";

/**
 * ThreeCanvas - Lightweight Three.js canvas wrapper.
 * Owns the single RAF loop: init on mount, renderFrame each frame,
 * dispose on unmount.
 *
 * Props:
 *   - onInit: (canvas) => void - Initialize Three.js scene
 *   - renderFrame: (time) => void - Called every frame to render
 *   - onDispose: () => void - Cleanup
 *   - style: object - Canvas style
 *   - className: string - Canvas class
 */
export default function ThreeCanvas({
  onInit,
  renderFrame,
  onDispose,
  style = {},
  className = "",
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    onInit?.(canvas);

    const loop = (time) => {
      renderFrame?.(time);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      onDispose?.();
    };
  }, [onInit, renderFrame, onDispose]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        ...style,
      }}
    />
  );
}
