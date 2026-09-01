import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThemeColor } from "../hooks/useThemeColor";

/**
 * Floating wireframe shapes for the Summary tab.
 * Vanilla Three.js, theme-aware colors, per-frame drift via subscribe.
 */
export default function SummaryScene({ sceneRef, subscribe, prefersReduced }) {
  const primary = useThemeColor("--three-primary", "#cc785c");
  const accent = useThemeColor("--three-accent", "#c89b3c");
  const fog = useThemeColor("--three-fog", "#faf9f5");

  const shapes = useMemo(
    () => [
      { type: "box", pos: [-2, 0.5, -1], color: primary, scale: 0.4 },
      { type: "sphere", pos: [2, -0.5, -2], color: accent, scale: 0.3 },
      { type: "box", pos: [0, 1, -3], color: fog, scale: 0.35 },
    ],
    [primary, accent, fog],
  );

  useEffect(() => {
    const scene = sceneRef?.current?.scene;
    if (!scene) return;

    const meshes = shapes.map(({ type, pos, color, scale }) => {
      const geometry =
        type === "box"
          ? new THREE.BoxGeometry(1, 1, 1)
          : new THREE.SphereGeometry(1, 32, 32);
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        wireframe: true,
        transparent: true,
        opacity: 0.3,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...pos);
      mesh.scale.setScalar(scale);
      scene.add(mesh);
      return { mesh, geometry, material };
    });

    const unsub = subscribe
      ? subscribe((time) => {
          const t = time * 0.001;
          meshes.forEach(({ mesh }, i) => {
            mesh.rotation.y = t * (0.15 + i * 0.05);
            mesh.position.y += Math.sin(t + i) * 0.0015;
          });
        })
      : null;

    return () => {
      unsub?.();
      meshes.forEach(({ mesh, geometry, material }) => {
        scene.remove(mesh);
        geometry.dispose();
        material.dispose();
      });
    };
  }, [sceneRef, subscribe, shapes]);

  return null;
}
