import React, { useRef, useMemo } from "react";
import * as THREE from "three";

/**
 * Floating cubes and spheres for summary tab.
 */
export default function SummaryScene({ prefersReduced = false }) {
  const groupRef = useRef();

  const shapes = useMemo(
    () => [
      { type: "box", pos: [-2, 0.5, -1], color: "var(--three-primary)", scale: 0.4 },
      { type: "sphere", pos: [2, -0.5, -2], color: "var(--three-accent)", scale: 0.3 },
      { type: "box", pos: [0, 1, -3], color: "var(--three-fog)", scale: 0.35 },
    ],
    []
  );

  return (
    <group ref={groupRef}>
      {shapes.map((shape, i) => (
        <Shape key={i} {...shape} prefersReduced={prefersReduced} />
      ))}
    </group>
  );
}

function Shape({ type, pos, color, scale, prefersReduced }) {
  const meshRef = useRef();

  const geometry = useMemo(() => {
    switch (type) {
      case "box":
        return new THREE.BoxGeometry(1, 1, 1);
      case "sphere":
        return new THREE.SphereGeometry(1, 32, 32);
      default:
        return new THREE.SphereGeometry(1, 32, 32);
    }
  }, [type]);

  return (
    <mesh ref={meshRef} position={pos} scale={scale} geometry={geometry}>
      <meshStandardMaterial
        color={color}
        wireframe
        transparent
        opacity={0.3}
      />
    </mesh>
  );
}
