import { useRef, useCallback, useEffect } from "react";
import * as THREE from "three";

/**
 * Manages Three.js scene lifecycle: init, animate, resize, dispose.
 * Usage:
 *   const { sceneRef, init, animate, dispose } = useThreeScene();
 */
export function useThreeScene() {
  const sceneRef = useRef({
    scene: null,
    camera: null,
    renderer: null,
    rafId: null,
    disposed: false,
  });

  const init = useCallback((canvas, options = {}) => {
    const s = sceneRef.current;
    if (s.renderer) return s;

    const {
      cameraPosition = [0, 0, 5],
      fov = 45,
      near = 0.1,
      far = 100,
      alpha = true,
      antialias = true,
    } = options;

    s.scene = new THREE.Scene();
    s.camera = new THREE.PerspectiveCamera(
      fov,
      canvas.clientWidth / canvas.clientHeight,
      near,
      far
    );
    s.camera.position.set(...cameraPosition);

    s.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha,
      antialias,
      powerPreference: "high-performance",
    });
    s.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    s.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    return s;
  }, []);

  const animate = useCallback((callback) => {
    const s = sceneRef.current;
    if (!s.renderer) return;

    const loop = (time) => {
      if (s.disposed) return;
      callback({ scene: s.scene, camera: s.camera, renderer: s.renderer, time });
      s.renderer.render(s.scene, s.camera);
      s.rafId = requestAnimationFrame(loop);
    };
    s.rafId = requestAnimationFrame(loop);
  }, []);

  const dispose = useCallback(() => {
    const s = sceneRef.current;
    s.disposed = true;
    if (s.rafId) cancelAnimationFrame(s.rafId);
    if (s.renderer) {
      s.renderer.dispose();
      s.renderer = null;
    }
    s.scene = null;
    s.camera = null;
  }, []);

  useEffect(() => {
    return () => dispose();
  }, [dispose]);

  return { sceneRef, init, animate, dispose };
}
