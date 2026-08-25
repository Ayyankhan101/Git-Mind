# GitMind UI Refinement & 3D Animations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full UI polish pass + incremental Three.js layer for premium 3D effects

**Architecture:** Add Three.js as background layer behind existing components. Upgrade CSS 3D shapes to WebGL. Add interactive hover/scroll effects. Clean separation — Three.js doesn't touch existing component logic.

**Tech Stack:** React 19, Three.js, @react-three/fiber, @react-three/drei, @react-three/postprocessing, GSAP, Lenis

## Global Constraints

- 60fps target, auto-downgrade at <45fps
- Respect `prefers-reduced-motion: reduce`
- Mobile: disable bloom, reduce particles (2000→500), disable DoF
- All 3D scenes have `aria-hidden="true"`
- Theme-aware materials via `getComputedStyle`
- Desktop-first, mobile graceful degradation

---

## Phase 1: UI Polish

### Task 1: Design Token Unification

**Files:**
- Modify: `src/design-tokens.css`
- Modify: `src/themes/*.css` (12 theme files)

**Interfaces:**
- Consumes: existing CSS custom properties
- Produces: new spacing scale (`--sp-1` through `--sp-12`), semantic tokens (`--card-bg`, `--card-border`, `--card-shadow`), animation tokens (`--duration-fast`, `--duration-normal`, `--duration-slow`)

- [ ] **Step 1: Add spacing scale to design-tokens.css**

```css
/* Spacing scale */
--sp-1: 4px;
--sp-2: 8px;
--sp-3: 12px;
--sp-4: 16px;
--sp-5: 20px;
--sp-6: 24px;
--sp-8: 32px;
--sp-10: 40px;
--sp-12: 48px;
```

- [ ] **Step 2: Add semantic card tokens to design-tokens.css**

```css
/* Card tokens */
--card-bg: var(--surface-1);
--card-border: var(--border-subtle);
--card-shadow: var(--shadow-sm);
```

- [ ] **Step 3: Verify animation tokens exist (already present)**

Check `--duration-fast: 120ms`, `--duration-normal: 200ms`, `--duration-slow: 350ms` exist.

- [ ] **Step 4: Add three tokens to each theme file**

Add to each of the 12 theme files:
```css
--three-primary: [theme primary];
--three-accent: [theme accent];
--three-fog: [theme bg];
```

- [ ] **Step 5: Run frontend tests**

Run: `cd frontend && npm test`
Expected: All 196 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/design-tokens.css src/themes/*.css
git commit -m "feat: unify design tokens across themes"
```

---

### Task 2: Component Consistency

**Files:**
- Modify: `src/index.css` (add new component classes)
- Modify: `src/components/SummaryTab.jsx` (migrate to new card classes)
- Modify: `src/components/SecurityTab.jsx`
- Modify: `src/components/CveTab.jsx`
- Modify: `src/components/ChatTab.jsx`

**Interfaces:**
- Consumes: design tokens from Task 1
- Produces: `.card`, `.card--elevated`, `.card--interactive` classes

- [ ] **Step 1: Add card classes to index.css**

```css
/* Card system */
.card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  box-shadow: var(--card-shadow);
  transition: transform var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out);
}
.card--elevated {
  box-shadow: var(--shadow-md);
}
.card--interactive:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-accent);
  border-color: var(--border-accent);
}
```

- [ ] **Step 2: Add tab header standard class**

```css
.tab-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-subtle);
}
.tab-header-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--primary-muted);
  display: grid;
  place-items: center;
  color: var(--primary);
}
```

- [ ] **Step 3: Add micro-interaction classes**

```css
.hover-lift { transition: transform var(--duration-fast) var(--ease-out); }
.hover-lift:hover { transform: translateY(-1px); }
.hover-glow { transition: box-shadow var(--duration-fast) var(--ease-out); }
.hover-glow:hover { box-shadow: var(--shadow-accent); }
```

- [ ] **Step 4: Migrate SummaryTab cards to .card classes**

Replace inline card styles with `.card` class.

- [ ] **Step 5: Migrate SecurityTab cards**

Replace inline card styles with `.card` class.

- [ ] **Step 6: Migrate CveTab cards**

Replace inline card styles with `.card` class.

- [ ] **Step 7: Migrate ChatTab cards**

Replace inline card styles with `.card` class.

- [ ] **Step 8: Run frontend tests**

Run: `cd frontend && npm test`
Expected: All 196 tests pass

- [ ] **Step 9: Commit**

```bash
git add src/index.css src/components/*.jsx
git commit -m "feat: standardize card and tab header components"
```

---

### Task 3: Landing Page Polish

**Files:**
- Modify: `src/components/LandingPage.jsx`
- Modify: `src/components/LandingPage.css`

**Interfaces:**
- Consumes: design tokens from Task 1, card classes from Task 2
- Produces: polished landing page with 100vh hero, gradient text, larger typography

- [ ] **Step 1: Update hero section height**

```css
.lp-hero {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 2: Add gradient text to headline**

```css
.lp-hero-title {
  font-size: 64px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--primary), var(--accent-2));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

- [ ] **Step 3: Increase input field height**

```css
.lp-hero-input {
  height: 48px;
  font-size: 16px;
}
```

- [ ] **Step 4: Update bento grid tile heights**

```css
.lp-feature[data-span="xl"] { min-height: 280px; }
.lp-feature[data-span="lg"] { min-height: 200px; }
.lp-feature[data-span="sm"] { min-height: 160px; }
```

- [ ] **Step 5: Add border-glow on hover**

```css
.lp-feature:hover {
  border-color: var(--border-accent);
  box-shadow: 0 0 20px var(--primary-muted);
}
```

- [ ] **Step 6: Update typography scale**

```css
.lp-hero-title { font-size: 64px; }
.lp-hero-subtitle { font-size: 20px; }
.lp-feature-title { font-size: 18px; }
.lp-feature-desc { font-size: 16px; }
```

- [ ] **Step 7: Update section spacing**

```css
.lp-section { padding: 96px 0; }
```

- [ ] **Step 8: Run frontend tests**

Run: `cd frontend && npm test`
Expected: All 196 tests pass

- [ ] **Step 9: Commit**

```bash
git add src/components/LandingPage.jsx src/components/LandingPage.css
git commit -m "feat: polish landing page hero and bento grid"
```

---

### Task 4: Dashboard Polish

**Files:**
- Modify: `src/components/CommandBar.jsx`
- Modify: `src/components/NavRail.jsx`
- Modify: `src/components/Sidebar.jsx`
- Modify: `src/components/DashboardLayout.jsx`

**Interfaces:**
- Consumes: design tokens from Task 1, card classes from Task 2
- Produces: polished command bar, nav rail, sidebar, tab transitions

- [ ] **Step 1: Update CommandBar height and glassmorphism**

```css
.command-bar {
  height: 56px;
  backdrop-filter: blur(20px) saturate(1.4);
  background: var(--glass-bg);
  border-bottom: 1px solid var(--glass-border);
}
```

- [ ] **Step 2: Add NavRail active state**

```css
.nav-rail-item.active {
  border-left: 2px solid var(--primary);
  background: var(--primary-muted);
}
.nav-rail-item:hover {
  background: var(--surface-2);
}
```

- [ ] **Step 3: Add tab content fade-in**

```css
.tab-content {
  animation: fadeIn var(--duration-normal) var(--ease-out);
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 4: Add tab max-width**

```css
.tab-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 24px;
}
```

- [ ] **Step 5: Add sidebar repo card hover**

```css
.repo-card:hover {
  transform: translateY(-1px);
  border-color: var(--border-accent);
  box-shadow: var(--shadow-accent);
}
```

- [ ] **Step 6: Run frontend tests**

Run: `cd frontend && npm test`
Expected: All 196 tests pass

- [ ] **Step 7: Commit**

```bash
git add src/components/CommandBar.jsx src/components/NavRail.jsx src/components/Sidebar.jsx src/components/DashboardLayout.jsx
git commit -m "feat: polish dashboard command bar, nav rail, and tabs"
```

---

## Phase 2: Three.js Infrastructure

### Task 5: Install Three.js Dependencies

**Files:**
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: existing React 19 setup
- Produces: Three.js, R3F, drei, postprocessing installed

- [ ] **Step 1: Install dependencies**

```bash
cd frontend
npm install three @react-three/fiber @react-three/drei @react-three/postprocessing
```

- [ ] **Step 2: Verify installation**

```bash
npm ls three @react-three/fiber @react-three/drei @react-three/postprocessing
```

- [ ] **Step 3: Run tests to verify no breakage**

```bash
npm test
```
Expected: All 196 tests pass

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install Three.js and R3F dependencies"
```

---

### Task 6: Create Three.js Hooks

**Files:**
- Create: `src/three/hooks/useReducedMotion.js`
- Create: `src/three/hooks/useMousePosition.js`
- Create: `src/three/hooks/useThemeColors.js`

**Interfaces:**
- Consumes: design tokens, theme data
- Produces: `useReducedMotion()`, `useMousePosition()`, `useThemeColors()`

- [ ] **Step 1: Create useReducedMotion hook**

```javascript
import { useState, useEffect } from 'react';

export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);
  
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  
  return reducedMotion;
}
```

- [ ] **Step 2: Create useMousePosition hook**

```javascript
import { useState, useEffect } from 'react';

export function useMousePosition() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  useEffect(() => {
    const handler = (e) => {
      setPosition({
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: -(e.clientY / window.innerHeight) * 2 + 1,
      });
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);
  
  return position;
}
```

- [ ] **Step 3: Create useThemeColors hook**

```javascript
import { useState, useEffect } from 'react';

export function useThemeColors() {
  const [colors, setColors] = useState({});
  
  useEffect(() => {
    const updateColors = () => {
      const root = document.documentElement;
      const style = getComputedStyle(root);
      setColors({
        primary: style.getPropertyValue('--three-primary').trim() || '#3b82f6',
        accent: style.getPropertyValue('--three-accent').trim() || '#8b5cf6',
        fog: style.getPropertyValue('--three-fog').trim() || '#090a0f',
      });
    };
    
    updateColors();
    
    const observer = new MutationObserver(updateColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  
  return colors;
}
```

- [ ] **Step 4: Create hooks barrel export**

```javascript
export { useReducedMotion } from './useReducedMotion';
export { useMousePosition } from './useMousePosition';
export { useThemeColors } from './useThemeColors';
```

- [ ] **Step 5: Commit**

```bash
git add src/three/
git commit -m "feat: add Three.js hooks for reduced motion, mouse, and theme"
```

---

### Task 7: Create ThreeCanvas and SceneManager

**Files:**
- Create: `src/three/ThreeCanvas.jsx`
- Create: `src/three/SceneManager.jsx`

**Interfaces:**
- Consumes: hooks from Task 6
- Produces: persistent canvas, route-based scene switching

- [ ] **Step 1: Create ThreeCanvas**

```javascript
import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { useReducedMotion } from './hooks';
import SceneManager from './SceneManager';

export default function ThreeCanvas() {
  const reducedMotion = useReducedMotion();
  
  if (reducedMotion) return null;
  
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 60 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={null}>
          <SceneManager />
        </Suspense>
      </Canvas>
    </div>
  );
}
```

- [ ] **Step 2: Create SceneManager**

```javascript
import React from 'react';
import { useLocation } from 'react-router-dom';
import AmbientScene from './scenes/AmbientScene';
import LandingScene from './scenes/LandingScene';
import DashboardScene from './scenes/DashboardScene';

export default function SceneManager() {
  const location = useLocation();
  const isLanding = location.pathname === '/';
  
  return (
    <>
      <AmbientScene />
      {isLanding && <LandingScene />}
      {!isLanding && <DashboardScene />}
    </>
  );
}
```

- [ ] **Step 3: Create placeholder scenes**

```javascript
// src/three/scenes/AmbientScene.jsx
export default function AmbientScene() { return null; }

// src/three/scenes/LandingScene.jsx
export default function LandingScene() { return null; }

// src/three/scenes/DashboardScene.jsx
export default function DashboardScene() { return null; }
```

- [ ] **Step 4: Add ThreeCanvas to App.jsx**

```javascript
import ThreeCanvas from './three/ThreeCanvas';

// In App component, add before UI layer:
<ThreeCanvas />
<div className="ui-layer" style={{ position: 'relative', zIndex: 1 }}>
  {/* existing UI */}
</div>
```

- [ ] **Step 5: Run tests**

```bash
cd frontend && npm test
```
Expected: All 196 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/three/ src/App.jsx
git commit -m "feat: add ThreeCanvas and SceneManager infrastructure"
```

---

## Phase 3: Ambient 3D

### Task 8: Landing 3D Scene

**Files:**
- Modify: `src/three/scenes/LandingScene.jsx`

**Interfaces:**
- Consumes: hooks from Task 6, canvas from Task 7
- Produces: particle field, floating wireframes, mouse parallax

- [ ] **Step 1: Create particle field**

```javascript
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function ParticleField({ count = 2000 }) {
  const mesh = useRef();
  
  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
      
      // Blue-violet gradient
      colors[i * 3] = 0.2 + Math.random() * 0.3; // R
      colors[i * 3 + 1] = 0.3 + Math.random() * 0.2; // G
      colors[i * 3 + 2] = 0.8 + Math.random() * 0.2; // B
    }
    
    return { positions, colors };
  }, [count]);
  
  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.y = state.clock.elapsedTime * 0.02;
      mesh.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.01) * 0.1;
    }
  });
  
  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particles.positions.length / 3}
          array={particles.positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={particles.colors.length / 3}
          array={particles.colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        vertexColors
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
```

- [ ] **Step 2: Create floating wireframes**

```javascript
function FloatingWireframe({ position, rotationSpeed, color }) {
  const mesh = useRef();
  
  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.x += rotationSpeed * 0.01;
      mesh.current.rotation.y += rotationSpeed * 0.015;
    }
  });
  
  return (
    <mesh ref={mesh} position={position}>
      <octahedronGeometry args={[0.5, 0]} />
      <meshBasicMaterial wireframe color={color} transparent opacity={0.4} />
    </mesh>
  );
}

const shapes = [
  { position: [-3, 2, -2], rotationSpeed: 0.3, color: '#3b82f6' },
  { position: [4, -1, -3], rotationSpeed: 0.5, color: '#8b5cf6' },
  { position: [0, 3, -4], rotationSpeed: 0.2, color: '#60a5fa' },
  { position: [-2, -2, -1], rotationSpeed: 0.4, color: '#a78bfa' },
];
```

- [ ] **Step 3: Add mouse parallax**

```javascript
import { useMousePosition } from '../hooks';

export default function LandingScene() {
  const mouse = useMousePosition();
  const group = useRef();
  
  useFrame(() => {
    if (group.current) {
      group.current.rotation.y = THREE.MathUtils.lerp(
        group.current.rotation.y,
        mouse.x * 0.1,
        0.05
      );
      group.current.rotation.x = THREE.MathUtils.lerp(
        group.current.rotation.x,
        mouse.y * 0.05,
        0.05
      );
    }
  });
  
  return (
    <group ref={group}>
      <ambientLight intensity={0.3} />
      <pointLight position={[5, 5, 5]} intensity={0.8} color="#3b82f6" />
      <ParticleField />
      {shapes.map((shape, i) => (
        <FloatingWireframe key={i} {...shape} />
      ))}
    </group>
  );
}
```

- [ ] **Step 4: Remove CSS radar sweep**

Comment out or remove `lpRadarSweep` animation from `LandingPage.css`.

- [ ] **Step 5: Run tests**

```bash
cd frontend && npm test
```
Expected: All 196 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/three/scenes/LandingScene.jsx src/components/LandingPage.css
git commit -m "feat: add landing page 3D scene with particles and wireframes"
```

---

### Task 9: Dashboard 3D Scene

**Files:**
- Modify: `src/three/scenes/DashboardScene.jsx`

**Interfaces:**
- Consumes: hooks from Task 6, canvas from Task 7
- Produces: glass shapes with mouse tracking

- [ ] **Step 1: Create glass shape component**

```javascript
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function GlassShape({ position, geometry, color, mouse }) {
  const mesh = useRef();
  
  useFrame(() => {
    if (mesh.current) {
      // Mouse tracking
      mesh.current.rotation.y = THREE.MathUtils.lerp(
        mesh.current.rotation.y,
        mouse.x * 0.3,
        0.05
      );
      mesh.current.rotation.x = THREE.MathUtils.lerp(
        mesh.current.rotation.x,
        mouse.y * 0.2,
        0.05
      );
      // Idle rotation
      mesh.current.rotation.z += 0.002;
    }
  });
  
  return (
    <mesh ref={mesh} position={position}>
      {geometry}
      <meshPhysicalMaterial
        color={color}
        transmission={0.8}
        roughness={0.2}
        metalness={0.1}
        transparent
        opacity={0.6}
      />
    </mesh>
  );
}
```

- [ ] **Step 2: Create DashboardScene**

```javascript
import React, { useRef } from 'react';
import { useMousePosition, useThemeColors } from '../hooks';

const shapes = [
  { position: [4, 3, -2], geometry: <octahedronGeometry args={[0.6, 0]} /> },
  { position: [-3, -2, -3], geometry: <boxGeometry args={[0.8, 0.8, 0.8]} /> },
  { position: [2, -3, -1], geometry: <torusGeometry args={[0.5, 0.15, 16, 32]} /> },
  { position: [-4, 2, -2], geometry: <tetrahedronGeometry args={[0.6, 0]} /> },
];

export default function DashboardScene() {
  const mouse = useMousePosition();
  const colors = useThemeColors();
  
  return (
    <group>
      <ambientLight intensity={0.4} />
      <pointLight position={[5, 5, 5]} intensity={0.6} color={colors.primary} />
      {shapes.map((shape, i) => (
        <GlassShape
          key={i}
          {...shape}
          color={colors.primary}
          mouse={mouse}
        />
      ))}
    </group>
  );
}
```

- [ ] **Step 3: Run tests**

```bash
cd frontend && npm test
```
Expected: All 196 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/three/scenes/DashboardScene.jsx
git commit -m "feat: add dashboard 3D scene with glass shapes"
```

---

## Phase 4: Interactive 3D

### Task 10: SummaryTab 3D Shapes

**Files:**
- Modify: `src/components/SummaryTab.jsx`

**Interfaces:**
- Consumes: DashboardScene from Task 9
- Produces: CSS 3D shapes replaced with Three.js glass meshes

- [ ] **Step 1: Remove CSS 3D shapes from SummaryTab**

Remove the `float-shapes-container` div and all CSS shape markup.

- [ ] **Step 2: Verify Three.js shapes render in DashboardScene**

The DashboardScene from Task 9 already provides the glass shapes. No additional code needed.

- [ ] **Step 3: Run tests**

```bash
cd frontend && npm test
```
Expected: All 196 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/components/SummaryTab.jsx
git commit -m "feat: replace CSS 3D shapes with Three.js glass meshes"
```

---

### Task 11: HealthCard 3D Gauge

**Files:**
- Modify: `src/components/HealthCard.jsx`
- Create: `src/three/scenes/HealthGaugeScene.jsx`

**Interfaces:**
- Consumes: canvas from Task 7, theme colors from Task 6
- Produces: 3D torus gauge with animated fill

- [ ] **Step 1: Create HealthGaugeScene**

```javascript
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const GRADE_COLOR = {
  A: '#34d399',
  B: '#34d399',
  C: '#fbbf24',
  D: '#fbbf24',
  F: '#f87171',
};

export default function HealthGaugeScene({ grade, percentage }) {
  const mesh = useRef();
  const color = GRADE_COLOR[grade] || '#6b7280';
  
  const arc = useMemo(() => (percentage / 100) * Math.PI * 2, [percentage]);
  
  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.z += 0.005;
    }
  });
  
  return (
    <group>
      <ambientLight intensity={0.3} />
      <pointLight position={[2, 2, 2]} intensity={0.8} color={color} />
      <mesh ref={mesh} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1, 0.15, 16, 64, arc]} />
        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          transmission={0.6}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 2: Add Canvas to HealthCard**

```javascript
import { Canvas } from '@react-three/fiber';
import HealthGaugeScene from '../three/scenes/HealthGaugeScene';

// In HealthCard component, replace SVG ring with:
<Canvas camera={{ position: [0, 0, 3], fov: 50 }}>
  <HealthGaugeScene grade={health.grade} percentage={health.score} />
</Canvas>
```

- [ ] **Step 3: Run tests**

```bash
cd frontend && npm test
```
Expected: All 196 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/components/HealthCard.jsx src/three/scenes/HealthGaugeScene.jsx
git commit -m "feat: add 3D health gauge with animated torus"
```

---

## Phase 5: Effects & Polish

### Task 12: Post-Processing Effects

**Files:**
- Modify: `src/three/ThreeCanvas.jsx`

**Interfaces:**
- Consumes: canvas from Task 7
- Produces: bloom, vignette, chromatic aberration effects

- [ ] **Step 1: Add EffectComposer to ThreeCanvas**

```javascript
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

// Inside Canvas, after SceneManager:
<EffectComposer>
  <Bloom
    threshold={0.8}
    intensity={0.3}
    luminanceSmoothing={0.4}
  />
  <Vignette
    offset={0.5}
    darkness={0.4}
    blendFunction={BlendFunction.NORMAL}
  />
  <ChromaticAberration
    offset={[0.001, 0.001]}
    blendFunction={BlendFunction.NORMAL}
  />
</EffectComposer>
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && npm test
```
Expected: All 196 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/three/ThreeCanvas.jsx
git commit -m "feat: add post-processing effects (bloom, vignette, chromatic)"
```

---

### Task 13: Performance Monitoring

**Files:**
- Create: `src/three/hooks/usePerformanceMonitor.js`
- Modify: `src/three/ThreeCanvas.jsx`

**Interfaces:**
- Consumes: canvas from Task 7
- Produces: FPS monitoring, auto-quality reduction

- [ ] **Step 1: Create usePerformanceMonitor hook**

```javascript
import { useState, useEffect, useRef } from 'react';

export function usePerformanceMonitor() {
  const [quality, setQuality] = useState('high');
  const fpsRef = useRef([]);
  
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    
    const measure = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        const fps = frameCount;
        fpsRef.current.push(fps);
        if (fpsRef.current.length > 5) fpsRef.current.shift();
        
        const avg = fpsRef.current.reduce((a, b) => a + b) / fpsRef.current.length;
        if (avg < 30) setQuality('low');
        else if (avg < 45) setQuality('medium');
        else setQuality('high');
        
        frameCount = 0;
        lastTime = now;
      }
      requestAnimationFrame(measure);
    };
    
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, []);
  
  return quality;
}
```

- [ ] **Step 2: Integrate quality into ThreeCanvas**

```javascript
const quality = usePerformanceMonitor();

// Pass quality to scenes and effects:
<SceneManager quality={quality} />
<Bloom intensity={quality === 'high' ? 0.3 : quality === 'medium' ? 0.15 : 0} />
```

- [ ] **Step 3: Commit**

```bash
git add src/three/hooks/usePerformanceMonitor.js src/three/ThreeCanvas.jsx
git commit -m "feat: add performance monitoring with auto-quality reduction"
```

---

### Task 14: Mobile Optimization

**Files:**
- Modify: `src/three/ThreeCanvas.jsx`
- Modify: `src/three/scenes/LandingScene.jsx`

**Interfaces:**
- Consumes: canvas from Task 7, quality from Task 13
- Produces: mobile-optimized 3D with reduced particles, no bloom

- [ ] **Step 1: Add mobile detection**

```javascript
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}
```

- [ ] **Step 2: Reduce particles on mobile**

```javascript
// In LandingScene:
const isMobile = useIsMobile();
const particleCount = isMobile ? 500 : 2000;

<ParticleField count={particleCount} />
```

- [ ] **Step 3: Disable bloom on mobile**

```javascript
// In ThreeCanvas:
{!isMobile && (
  <EffectComposer>
    <Bloom ... />
  </EffectComposer>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/three/ThreeCanvas.jsx src/three/scenes/LandingScene.jsx
git commit -m "feat: optimize 3D for mobile (reduce particles, disable bloom)"
```

---

## Summary

| Phase | Tasks | Estimated Hours |
|-------|-------|-----------------|
| Phase 1: UI Polish | Tasks 1-4 | 8-12 hours |
| Phase 2: Three.js Infrastructure | Tasks 5-7 | 6-8 hours |
| Phase 3: Ambient 3D | Tasks 8-9 | 10-14 hours |
| Phase 4: Interactive 3D | Tasks 10-11 | 10-14 hours |
| Phase 5: Effects & Polish | Tasks 12-14 | 6-10 hours |
| **Total** | **14 tasks** | **40-60 hours** |
