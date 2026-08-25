import React, { useRef, useEffect } from "react";

/**
 * ThreeCanvas - Lightweight Three.js canvas wrapper.
 * Renders a <canvas> element and calls onInit/Animate/Dispose callbacks.
 *
 * Props:
 *   - onInit: (canvas) => void - Initialize Three.js scene
 *   - animate: (time) => void - Animation loop
 *   - onDispose: () => void - Cleanup
 *   - style: object - Canvas style
 *   - className: string - Canvas class
 */
export default function ThreeCanvas({
  onInit,
  animate,
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

    if (animate) {
      const loop = (time) => {
        animate(time);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      onDispose?.();
    };
  }, [onInit, animate, onDispose]);

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
