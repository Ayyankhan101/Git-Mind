# GitMind UI Refinement & 3D Animations — Design Spec

**Date:** 2026-08-25  
**Branch:** develop  
**Status:** Approved (10/10 sections)

## Overview

Full UI polish pass + incremental Three.js layer for premium 3D effects. Maximum quality, 60fps target, desktop-first.

## Approach: Incremental Three.js Layer

Add Three.js as background layer behind existing components. Upgrade CSS 3D shapes to WebGL. Add interactive hover/scroll effects. Clean separation — Three.js doesn't touch existing component logic.

## Phase 1: UI Polish

### 1.1 Design Token Unification
- Standardize spacing scale: `--sp-1` (4px) through `--sp-12` (48px)
- Add semantic tokens: `--card-bg`, `--card-border`, `--card-shadow`
- Add animation tokens: `--duration-fast` (120ms), `--duration-normal` (200ms), `--duration-slow` (350ms)
- Files: `src/design-tokens.css`, `src/themes/*.css`

### 1.2 Component Consistency
- Canonical card classes: `.card`, `.card--elevated`, `.card--interactive`
- Standardized hover: lift (-1px Y), glow (accent shadow), border highlight
- Unified tab headers: icon, eyebrow, title, subtitle layout
- Micro-interactions: button press scale (0.98), input focus glow
- Files: `src/index.css`, all dashboard tab components

### 1.3 Landing Page Polish
- Hero: 100vh height, gradient text on headline, 48px input height
- Features bento: xl=280px, lg=200px, sm=160px, border-glow on hover
- Stats: GSAP CountUp animation, 48px values
- Typography: headline 64px, subheadline 20px, body 16px
- Section gap: 96px
- Files: `src/components/LandingPage.jsx`, `src/components/LandingPage.css`

### 1.4 Dashboard Polish
- CommandBar: 56px height, glassmorphism, gradient border
- NavRail: active state indicator, tooltip, 20px icons
- Sidebar: repo card hover, last analyzed timestamp
- Tab content: fade-in (150ms), scroll-to-top, max-width 1200px
- Files: `src/components/CommandBar.jsx`, `src/components/NavRail.jsx`, `src/components/Sidebar.jsx`, `src/components/DashboardLayout.jsx`

## Phase 2: Three.js Infrastructure

### 2.1 Three.js Setup
- Install: `@react-three/fiber`, `@react-three/drei`, `three`
- Create `src/three/ThreeCanvas.jsx` — persistent full-viewport canvas
- Create `src/three/SceneManager.jsx` — route-based scene switching
- Create hooks: `useReducedMotion.js`, `useMousePosition.js`
- Architecture:
```
App.jsx
├── ThreeCanvas (z-index: 0, position: fixed)
│   └── SceneManager
│       ├── AmbientScene (always active)
│       ├── LandingScene (hero)
│       ├── DashboardScene (summary shapes)
│       └── DiagramScene (3D nodes)
└── <div className="ui-layer" style={{ position: 'relative', zIndex: 1 }}>
```
- Performance: 60fps target, auto-downgrade at <45fps, <50K triangles

## Phase 3: Ambient 3D

### 3.1 Landing 3D Scene
- Particle field: 2000 particles, depth-of-field, blue-violet gradient
- Floating geometry: 8-12 wireframe shapes (octahedron, icosahedron, torus, tetrahedron)
- Mouse parallax: ±5° camera rotation
- Scroll integration: shapes compress + particles scatter
- Post-processing: Bloom (threshold: 0.8, intensity: 0.3)
- Remove CSS radar sweep, replace with Three.js

### 3.2 Theme Integration
- Per-theme tokens: `--three-primary`, `--three-accent`, `--three-fog`
- Theme-aware materials via `getComputedStyle`
- Per-theme particle colors and lighting
- Smooth transition on theme switch (300ms)
- Files: all `src/themes/*.css`, new `src/three/hooks/useThemeColors.js`

## Phase 4: Interactive 3D

### 4.1 Dashboard 3D Elements
- SummaryTab shapes: CSS 3D → Three.js glass meshes (transmission: 0.8, roughness: 0.2)
- Mouse tracking: shapes tilt toward cursor
- HealthCard: SVG ring → Three.js torus, animated fill, grade-based color
- DiagramTab: optional 3D node view toggle
- Files: `src/components/SummaryTab.jsx`, `src/components/HealthCard.jsx`, `src/components/DiagramTab.jsx`

## Phase 5: Effects & Polish

### 5.1 Post-Processing
- Bloom (threshold: 0.8, intensity: 0.3, radius: 0.4)
- Depth of field (focus: 5, aperture: 0.02)
- Vignette (offset: 0.5, darkness: 0.4)
- Chromatic aberration (offset: 0.001)
- Film grain (noise: 0.15, intensity: 0.015)

### 5.2 Performance & Accessibility
- FPS monitoring, auto-quality reduction at <45fps
- Respect `prefers-reduced-motion` — disable WebGL, show CSS fallback
- Mobile: disable bloom, reduce particles (2000→500), disable DoF
- 3D scenes: `aria-hidden="true"`, no keyboard trapping
- Toggle in settings: "Enable 3D effects" (localStorage)

## Estimated Effort

40-60 hours across 4 phases:
- Phase 1 (UI Polish): 8-12 hours
- Phase 2 (Three.js Setup): 6-8 hours
- Phase 3 (Ambient 3D): 10-14 hours
- Phase 4 (Interactive 3D): 10-14 hours
- Phase 5 (Effects): 6-10 hours

## New Dependencies

- `@react-three/fiber` — React Three.js renderer
- `@react-three/drei` — Three.js helpers
- `three` — Three.js core
- `@react-three/postprocessing` — bloom, vignette, etc.
