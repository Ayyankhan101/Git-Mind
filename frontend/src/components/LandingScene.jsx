import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThemeColor } from "../hooks/useThemeColor";

/**
 * Floating geometric shapes for the landing hero.
 * Vanilla Three.js: meshes are created imperatively and added to the
 * scene from sceneRef; per-frame rotation registered via subscribe.
 */
export default function LandingScene({ sceneRef, subscribe, prefersReduced }) {
  const primary = useThemeColor("--three-primary", "#3b82f6");
  const accent = useThemeColor("--three-accent", "#8b5cf6");
  const fog = useThemeColor("--three-fog", "#94a3b8");

  const shapes = useMemo(
    () => [
      { type: "icosa", pos: [-3, 1.5, -2], color: primary, speed: 0.3, scale: 0.8 },
      { type: "octa", pos: [3, -1, -3], color: accent, speed: 0.4, scale: 0.6 },
      { type: "torus", pos: [2, 2, -4], color: fog, speed: 0.2, scale: 0.7 },
    ],
    [primary, accent, fog]
  );

  useEffect(() => {
    const scene = sceneRef?.current?.scene;
    if (!scene) return;

    const meshes = shapes.map(({ type, pos, color, scale }) => {
      let geometry;
      switch (type) {
        case "icosa":
          geometry = new THREE.IcosahedronGeometry(1, 0);
          break;
        case "octa":
          geometry = new THREE.OctahedronGeometry(1, 0);
          break;
        case "torus":
          geometry = new THREE.TorusGeometry(1, 0.3, 16, 32);
          break;
        default:
          geometry = new THREE.SphereGeometry(1, 32, 32);
      }
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        wireframe: true,
        transparent: true,
        opacity: 0.4,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...pos);
      mesh.scale.setScalar(scale);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      scene.add(mesh);
      return { mesh, geometry, material };
    });

    const unsub = subscribe
      ? subscribe((time) => {
          const t = time * 0.001;
          meshes.forEach(({ mesh }, i) => {
            mesh.rotation.y = t * (0.2 + i * 0.1);
            mesh.rotation.x = Math.sin(t * 0.3 + i) * 0.3;
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
