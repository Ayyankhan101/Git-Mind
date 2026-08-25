import React, { useCallback, useRef, useState, useEffect } from "react";
import ThreeCanvas from "./ThreeCanvas";
import { useThreeScene } from "../hooks/useThreeScene";
import { useReducedMotion } from "../hooks/useReducedMotion";

/**
 * SceneManager - Orchestrates the Three.js scene lifecycle.
 * ThreeCanvas owns the single RAF loop; SceneManager exposes
 * { sceneRef, subscribe, prefersReduced } to scene children via
 * render prop. Children are mounted only after scene init (ready),
 * so their effects can safely add objects to sceneRef.current.scene.
 *
 * Props:
 *   - children: ({ sceneRef, subscribe, prefersReduced }) => React.ReactNode
 *   - className: string
 *   - style: object
 */
export default function SceneManager({ children, className = "", style = {} }) {
  const { sceneRef, init, renderFrame, dispose } = useThreeScene();
  const prefersReduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const subscribersRef = useRef(new Set());

  const subscribe = useCallback((fn) => {
    subscribersRef.current.add(fn);
    return () => subscribersRef.current.delete(fn);
  }, []);

  const handleInit = useCallback(
    (canvas) => {
      init(canvas, {
        cameraPosition: [0, 0, 5],
        fov: 45,
        alpha: true,
        antialias: true,
      });
      setReady(true);
    },
    [init]
  );

  const handleFrame = useCallback(
    (time) => {
      if (prefersReduced) return;
      subscribersRef.current.forEach((fn) => fn(time));
      renderFrame();
    },
    [prefersReduced, renderFrame]
  );

  // Reduced motion: render one static frame so the scene is visible
  // but never animates.
  useEffect(() => {
    if (ready && prefersReduced) renderFrame();
  }, [ready, prefersReduced, renderFrame]);

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
        renderFrame={handleFrame}
        onDispose={dispose}
        style={{ position: "absolute", inset: 0 }}
      />
      {ready && children?.({ sceneRef, subscribe, prefersReduced })}
    </div>
  );
}
