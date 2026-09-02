import { useRef, useCallback, useEffect } from "react";
import * as THREE from "three";

/**
 * Manages Three.js scene lifecycle: init, renderFrame, dispose.
 * No internal RAF loop — ThreeCanvas drives the single animation loop
 * and calls renderFrame(time) each frame.
 *
 * - ResizeObserver keeps renderer/camera in sync with canvas size.
 * - init() resets the disposed flag so a mid-session teardown (e.g.
 *   prefers-reduced-motion flip re-running the ThreeCanvas effect)
 *   revives the scene instead of bricking it.
 * - dispose() traverses the scene freeing geometries/materials, then
 *   forceContextLoss() so WebGL contexts never accumulate.
 */
export function useThreeScene() {
  const sceneRef = useRef({
    scene: null,
    camera: null,
    renderer: null,
    resizeObserver: null,
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

    s.disposed = false;
    s.scene = new THREE.Scene();
    s.camera = new THREE.PerspectiveCamera(
      fov,
      canvas.clientWidth / canvas.clientHeight,
      near,
      far,
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

    // Keep the drawing buffer and camera aspect in sync with layout.
    const parent = canvas.parentElement || canvas;
    if (typeof ResizeObserver !== "undefined") {
      s.resizeObserver = new ResizeObserver((entries) => {
        if (s.disposed || !s.renderer) return;
        const entry = entries[0];
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          s.renderer.setSize(width, height, false);
          s.camera.aspect = width / height;
          s.camera.updateProjectionMatrix();
        }
      });
      s.resizeObserver.observe(parent);
    }

    return s;
  }, []);

  const renderFrame = useCallback(() => {
    const s = sceneRef.current;
    if (!s.renderer || s.disposed) return;
    s.renderer.render(s.scene, s.camera);
  }, []);

  const dispose = useCallback(() => {
    const s = sceneRef.current;
    s.disposed = true;
    if (s.resizeObserver) {
      s.resizeObserver.disconnect();
      s.resizeObserver = null;
    }
    if (s.scene) {
      s.scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        const mats = Array.isArray(obj.material)
          ? obj.material
          : obj.material
            ? [obj.material]
            : [];
        mats.forEach((m) => m.dispose());
      });
      s.scene.clear();
    }
    if (s.renderer) {
      s.renderer.dispose();
      s.renderer.forceContextLoss?.();
      s.renderer = null;
    }
    s.scene = null;
    s.camera = null;
  }, []);

  useEffect(() => {
    return () => dispose();
  }, [dispose]);

  return { sceneRef, init, renderFrame, dispose };
}
