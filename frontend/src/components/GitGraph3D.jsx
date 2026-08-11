import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

const BRANCH_COLORS = [
  new THREE.Color("#7c6fe0"),
  new THREE.Color("#60a5fa"),
  new THREE.Color("#34d399"),
  new THREE.Color("#fbbf24"),
];

function generateGitGraph() {
  const nodes = [];
  const edges = [];
  const branchCount = 4;
  const commitsPerBranch = [8, 6, 5, 4];

  for (let b = 0; b < branchCount; b++) {
    const count = commitsPerBranch[b];
    const xOff = (b - (branchCount - 1) / 2) * 2.5;
    const zOff = (b - (branchCount - 1) / 2) * 0.8;

    for (let c = 0; c < count; c++) {
      const y = c * 1.8 - (count * 1.8) / 2;
      const jitter = Math.sin(c * 1.3 + b) * 0.3;
      nodes.push({
        position: [xOff + jitter, y, zOff + Math.cos(c + b) * 0.4],
        color: BRANCH_COLORS[b],
        isMerge: c === count - 1 && b > 0,
        scale: c === 0 ? 0.18 : c === count - 1 ? 0.22 : 0.14,
      });

      if (c > 0) {
        edges.push({
          from: nodes.length - 2,
          to: nodes.length - 1,
          color: BRANCH_COLORS[b],
        });
      }
    }

    if (b > 0 && commitsPerBranch[b] > 0) {
      const mergeTarget = commitsPerBranch[0] - 1;
      const mergeSource =
        commitsPerBranch.slice(0, b).reduce((a, v) => a + v, 0) +
        commitsPerBranch[b] -
        1;
      edges.push({
        from: mergeSource,
        to: mergeTarget,
        color: BRANCH_COLORS[b],
        isMerge: true,
      });
    }
  }

  return { nodes, edges };
}

function CommitNode({ position, color, scale, time }) {
  const ref = useRef();

  useFrame(() => {
    if (!ref.current) return;
    const pulse = Math.sin(time * 0.8 + position[0] * 0.5) * 0.03;
    ref.current.scale.setScalar(scale + pulse);
  });

  return (
    <group position={position}>
      <mesh ref={ref}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.7} />
      </mesh>
    </group>
  );
}

function BranchLine({ from, to, color, isMerge }) {
  const ref = useRef();

  const curve = useMemo(() => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const mid = new THREE.Vector3()
      .addVectors(start, end)
      .multiplyScalar(0.5);
    mid.z += isMerge ? 1.5 : 0.4;
    mid.x += (Math.random() - 0.5) * 0.3;
    return new THREE.QuadraticBezierCurve3(start, mid, end);
  }, [from, to, isMerge]);

  const geometry = useMemo(() => {
    return new THREE.TubeGeometry(curve, 20, 0.03, 6, false);
  }, [curve]);

  return (
    <mesh ref={ref} geometry={geometry}>
      <meshStandardMaterial
        color={color}
        transparent
        opacity={isMerge ? 0.6 : 0.8}
        roughness={0.5}
      />
    </mesh>
  );
}

function FloatingParticles({ count = 30 }) {
  const ref = useRef();
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 20;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 20;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    return arr;
  }, [count]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const pos = ref.current.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] += Math.sin(t * 0.3 + i) * 0.002;
      pos[i * 3] += Math.cos(t * 0.2 + i * 0.5) * 0.001;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        color="#7c6fe0"
        transparent
        opacity={0.5}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

function Scene() {
  const { nodes, edges } = useMemo(() => generateGitGraph(), []);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    timeRef.current += delta;
  });

  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[5, 8, 5]} intensity={0.8} color="#7c6fe0" />
      <pointLight position={[-5, -4, 3]} intensity={0.4} color="#60a5fa" />

      {edges.map((edge, i) => (
        <BranchLine
          key={`e-${i}`}
          from={nodes[edge.from].position}
          to={nodes[edge.to].position}
          color={edge.color}
          isMerge={edge.isMerge}
        />
      ))}

      {nodes.map((node, i) => (
        <CommitNode
          key={`n-${i}`}
          position={node.position}
          color={node.color}
          scale={node.scale}
          isMerge={node.isMerge}
          time={timeRef.current}
        />
      ))}

      <FloatingParticles />

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.4}
        maxPolarAngle={Math.PI / 1.6}
        minPolarAngle={Math.PI / 3}
      />
    </>
  );
}

export default function GitGraph3D({ className, style }) {
  const prefersReduced = useRef(
    window.matchMedia("(prefers-reduced-motion: reduce)")?.matches ?? false
  );

  if (prefersReduced.current) return null;

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        ...style,
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 12], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
        dpr={[1, 1.5]}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
