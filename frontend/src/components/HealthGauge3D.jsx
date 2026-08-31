import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThemeColor } from "../hooks/useThemeColor";

/**
 * 3D gauge ring for HealthCard.
 * Ring hue encodes the health score (red → green). Theme-aware: the
 * resolved --three-primary lightness decides light/dark tuning, and the
 * material is rebuilt whenever the theme changes.
 */
export default function HealthGauge3D({ sceneRef, subscribe, score = 75 }) {
  const themePrimary = useThemeColor("--three-primary", "#cc785c");

  const material = useMemo(() => {
    const tp = new THREE.Color(themePrimary);
    const hsl = { h: 0, s: 0, l: 0 };
    tp.getHSL(hsl);
    const isLightTheme = hsl.l > 0.6;
    const hue = (score / 100) * 0.3; // 0 = red, 0.3 = green
    const color = new THREE.Color().setHSL(hue, 0.8, isLightTheme ? 0.38 : 0.55);
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
    });
  }, [score, themePrimary]);

  useEffect(() => {
    const scene = sceneRef?.current?.scene;
    if (!scene) return;

    const geometry = new THREE.TorusGeometry(1.5, 0.15, 16, 64);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.z = -(score / 100) * Math.PI;
    scene.add(mesh);

    const unsub = subscribe
      ? subscribe((time) => {
          const t = time * 0.001;
          mesh.rotation.x = Math.sin(t * 0.4) * 0.15;
        })
      : null;

    return () => {
      unsub?.();
      scene.remove(mesh);
      geometry.dispose();
      // Material is memoized per theme/score — dispose on unmount only
      // if this effect owned the last reference.
      material.dispose();
    };
  }, [sceneRef, subscribe, material, score]);

  return null;
}
