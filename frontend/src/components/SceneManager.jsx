import React, { useCallback } from "react";
import ThreeCanvas from "./ThreeCanvas";
import { useThreeScene } from "../hooks/useThreeScene";
import { useReducedMotion } from "../hooks/useReducedMotion";

/**
 * SceneManager - Orchestrates multiple Three.js scenes.
 * Renders different scene content based on route/viewport.
 *
 * Props:
 *   - children: (helpers) => React.ReactNode - Scene content renderer
 *   - className: string
 *   - style: object
 */
export default function SceneManager({ children, className = "", style = {} }) {
  const { sceneRef, init, animate, dispose } = useThreeScene();
  const prefersReduced = useReducedMotion();

  const handleInit = useCallback(
    (canvas) => {
      init(canvas, {
        cameraPosition: [0, 0, 5],
        fov: 45,
        alpha: true,
        antialias: true,
      });
    },
    [init]
  );

  const handleAnimate = useCallback(
    (time) => {
      if (prefersReduced) return;
      animate(time);
    },
    [animate, prefersReduced]
  );

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        ...style,
      }}
    >
      <ThreeCanvas
        onInit={handleInit}
        animate={handleAnimate}
        onDispose={dispose}
        style={{ position: "absolute", inset: 0 }}
      />
      {children?.({ sceneRef, prefersReduced })}
    </div>
  );
}
