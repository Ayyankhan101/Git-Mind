import React, { useRef, useMemo } from "react";
import * as THREE from "three";

/**
 * 3D gauge ring for HealthCard.
 * Shows health score as a glowing ring.
 */
export default function HealthGauge3D({ score = 75, prefersReduced = false }) {
  const groupRef = useRef();
  const meshRef = useRef();

  const geometry = useMemo(() => {
    return new THREE.TorusGeometry(1.5, 0.15, 16, 64);
  }, []);

  const material = useMemo(() => {
    const hue = (score / 100) * 0.3; // 0=red, 0.3=green
    const color = new THREE.Color().setHSL(hue, 0.8, 0.5);
    return new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.8,
    });
  }, [score]);

  const rotation = useMemo(() => {
    const angle = (score / 100) * Math.PI * 2;
    return [0, 0, -angle / 2];
  }, [score]);

  return (
    <group ref={groupRef} rotation={rotation}>
      <mesh ref={meshRef} geometry={geometry} material={material} />
    </group>
  );
}
