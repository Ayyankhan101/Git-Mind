import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThemeColor } from "../hooks/useThemeColor";

const PARTICLE_COUNT = 120;
const CONNECT_DISTANCE = 2;
const SPACE = { xy: 20, z: 10, zOffset: -5 };

/**
 * Particle network for the dashboard background.
 * Vanilla Three.js: 120 points + LineSegments connecting every pair
 * within CONNECT_DISTANCE units. Theme-aware colors.
 */
export default function DashboardScene({
  sceneRef,
  subscribe,
  prefersReduced,
}) {
  const primary = useThemeColor("--three-primary", "#cc785c");

  const particles = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * SPACE.xy;
      positions[i * 3 + 1] = (Math.random() - 0.5) * SPACE.xy;
      positions[i * 3 + 2] = (Math.random() - 0.5) * SPACE.z + SPACE.zOffset;
    }
    return positions;
  }, []);

  useEffect(() => {
    const scene = sceneRef?.current?.scene;
    if (!scene) return;

    // Points
    const pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(particles.slice(), 3),
    );
    const pointsMaterial = new THREE.PointsMaterial({
      color: new THREE.Color(primary),
      size: 0.12,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    scene.add(points);

    // Line segments: connect every pair within CONNECT_DISTANCE
    const linePositions = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      for (let j = i + 1; j < PARTICLE_COUNT; j++) {
        const dx = particles[i * 3] - particles[j * 3];
        const dy = particles[i * 3 + 1] - particles[j * 3 + 1];
        const dz = particles[i * 3 + 2] - particles[j * 3 + 2];
        if (dx * dx + dy * dy + dz * dz < CONNECT_DISTANCE * CONNECT_DISTANCE) {
          linePositions.push(
            particles[i * 3],
            particles[i * 3 + 1],
            particles[i * 3 + 2],
            particles[j * 3],
            particles[j * 3 + 1],
            particles[j * 3 + 2],
          );
        }
      }
    }
    const linesGeometry = new THREE.BufferGeometry();
    linesGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(linePositions, 3),
    );
    const linesMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(primary),
      transparent: true,
      opacity: 0.15,
    });
    const lines = new THREE.LineSegments(linesGeometry, linesMaterial);
    scene.add(lines);

    const unsub = subscribe
      ? subscribe((time) => {
          const t = time * 0.001;
          points.rotation.y = t * 0.05;
          lines.rotation.y = t * 0.05;
        })
      : null;

    return () => {
      unsub?.();
      scene.remove(points);
      scene.remove(lines);
      pointsGeometry.dispose();
      pointsMaterial.dispose();
      linesGeometry.dispose();
      linesMaterial.dispose();
    };
  }, [sceneRef, subscribe, particles, primary]);

  return null;
}
