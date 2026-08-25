import { useRef, useCallback, useEffect } from "react";

/**
 * Monitors FPS and triggers quality reduction if below threshold.
 * Returns current FPS and quality level.
 */
export function usePerformanceMonitor({ targetFps = 30, windowSize = 60 } = {}) {
  const frameTimesRef = useRef([]);
  const fpsRef = useRef(60);
  const qualityRef = useRef("high");

  const recordFrame = useCallback(() => {
    const now = performance.now();
    frameTimesRef.current.push(now);

    // Keep only recent frames
    if (frameTimesRef.current.length > windowSize) {
      frameTimesRef.current.shift();
    }

    // Calculate FPS
    if (frameTimesRef.current.length > 1) {
      const elapsed =
        frameTimesRef.current[frameTimesRef.current.length - 1] -
        frameTimesRef.current[0];
      const fps = ((frameTimesRef.current.length - 1) / elapsed) * 1000;
      fpsRef.current = Math.round(fps);

      // Adjust quality
      if (fps < targetFps * 0.5) {
        qualityRef.current = "low";
      } else if (fps < targetFps) {
        qualityRef.current = "medium";
      } else {
        qualityRef.current = "high";
      }
    }
  }, [targetFps, windowSize]);

  return {
    fps: fpsRef.current,
    quality: qualityRef.current,
    recordFrame,
  };
}
