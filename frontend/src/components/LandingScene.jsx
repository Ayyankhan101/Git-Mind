import React, { useRef, useMemo } from "react";
import * as THREE from "three";

/**
 * Floating geometric shapes for landing page.
 * Icosahedron, octahedron, and torus.
 */
export default function FloatingShapes({ prefersReduced = false }) {
  const groupRef = useRef();

  const shapes = useMemo(
    () => [
      { type: "icosa", pos: [-3, 1.5, -2], color: "var(--three-primary)", speed: 0.3, scale: 0.8 },
      { type: "octa", pos: [3, -1, -3], color: "var(--three-accent)", speed: 0.4, scale: 0.6 },
      { type: "torus", pos: [2, 2, -4], color: "var(--three-fog)", speed: 0.2, scale: 0.7 },
    ],
    []
  );

  return (
    <group ref={groupRef}>
      {shapes.map((shape, i) => (
        <FloatingShape key={i} {...shape} prefersReduced={prefersReduced} />
      ))}
    </group>
  );
}

function FloatingShape({ type, pos, color, speed, scale, prefersReduced }) {
  const meshRef = useRef();
  const materialRef = useRef();

  const geometry = useMemo(() => {
    switch (type) {
      case "icosa":
        return new THREE.IcosahedronGeometry(1, 0);
      case "octa":
        return new THREE.OctahedronGeometry(1, 0);
      case "torus":
        return new THREE.TorusGeometry(1, 0.3, 16, 32);
      default:
        return new THREE.SphereGeometry(1, 32, 32);
    }
  }, [type]);

  return (
    <mesh
      ref={meshRef}
      position={pos}
      scale={scale}
      geometry={geometry}
      rotation={[Math.random() * Math.PI, Math.random() * Math.PI, 0]}
    >
      <meshStandardMaterial
        ref={materialRef}
        color={color}
        wireframe
        transparent
        opacity={0.4}
      />
    </mesh>
  );
}
