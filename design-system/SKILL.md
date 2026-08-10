---
name: gitmind-midnight-studio
description: >
  Midnight Studio design system for GitMind — deep navy dark UI, single indigo accent,
  code intelligence platform components and tokens.
user-invocable: true
---

# GitMind Midnight Studio — Design System Skill

Use this skill when building UI for GitMind or any dark-themed code intelligence tool.
Follows the Midnight Studio design system.

## What Is Inside

| File | Purpose |
|------|---------|
| `DESIGN.md` | Complete design system documentation — color, type, spacing, layout, components, motion, voice, anti-patterns |
| `colors_and_type.css` | Extracted CSS custom properties and base reset |
| `brand-spec.md` | Original brand specification from source project |
| `brand.json` | Machine-readable token export (JSON) |
| `theme.json` | Per-theme token maps for all 13 themes |
| `preview/` | Focused visual spec cards — colors, typography, spacing, components, themes, navigation |
| `ui_kits/kit.html` | Standalone component kit (dark, theme-switchable) |
| `ui_kits/kit.light.html` | Standalone component kit (light/Daylight mode) |
| `ui_kits/app/` | Applied interface kit — full dashboard layout loading `colors_and_type.css` |
| `context/provenance.md` | Token and asset provenance notes |

## Source Context

- **Source Project**: GitMind Frontend Refactor (73d76dc3-6777-487b-9587-6b228c3be8cb)
- **Theme**: Midnight Studio — polished dark UI for code intelligence
- **Product**: GitMind analyzes repositories to surface architectural patterns, security vulnerabilities, and code quality metrics
- **Surface**: Desktop web application with navigation rail, dashboard panels, code blocks, stat tiles
- **Primary accent**: Indigo (#7c6fe0) — single accent, never competing colors

## When to Use

- Building new GitMind frontend components
- Creating dashboards with code/security metrics
- Designing dark-themed developer tools
- Applying the Midnight Studio visual language to new surfaces

## How to Use

1. Copy `colors_and_type.css` into your project's first `<style>` block
2. Import Inter (300–700) and JetBrains Mono (400–500) from Google Fonts
3. Follow component patterns in `DESIGN.md` section 6
4. Reference preview cards in `preview/` for visual spec
5. Use `ui_kits/app/index.html` as reference for full layout patterns

## Design System Highlights

### Token Reference

All values use CSS custom properties in `:root`.

**Key Colors:**
- Background: `--bg` (#08090e)
- Card base: `--surface-0` (#0d0e16)
- Elevated: `--surface-1` (#11121c)
- Accent: `--primary` (#7c6fe0)
- Text: `--text-primary` (#f0eff4), `--text-secondary` (#a8a7b3), `--text-tertiary` (#6d6c7a)

**Typography:**
- Display: Inter 700, 48px, -0.025em
- H1: Inter 600, 36px, -0.02em
- Body: Inter 400, 16px, 1.55 line-height
- Code: JetBrains Mono 400, 15px

**Spacing:**
7-step scale: 4 · 8 · 16 · 24 · 32 · 48 · 64px. Never use arbitrary values.

### Component Patterns

**Button Variants:**
- Primary: `--primary` bg, `--text-on-primary` text
- Secondary: `--surface-2` bg, `--border-strong` border
- Ghost: transparent bg, `--text-secondary` text
- Danger: `--danger` bg, white text

**Card Pattern:**
```css
background: var(--surface-0);
border: 1px solid var(--border-subtle);
border-radius: var(--radius-lg);
padding: var(--space-xl);
```

**Input Pattern:**
```css
background: var(--surface-1);
border: 1px solid var(--border-default);
border-radius: var(--radius-md);
/* focus: */ border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-subtle);
```

### Anti-patterns

- Never use multiple accent colors
- Never use gradients on backgrounds
- Never make text lighter on hover
- Always use the spacing scale
- Always respect prefers-reduced-motion
- Minimum 44px touch targets

### Motion Tokens

- `--duration-fast`: 120ms — hover, focus
- `--duration-normal`: 200ms — transitions
- `--duration-slow`: 350ms — page transitions
- `--ease-out`: cubic-bezier(0.16, 1, 0.3, 1)

### Code Syntax Tokens

- `--code-keyword`: `#c4b5fd` (light purple)
- `--code-string`: `#a5d6a7` (green)
- `--code-comment`: `#6d6c7a` (tertiary text)
- `--code-fn`: `#93c5fd` (blue)
- `--code-number`: `#fbbf24` (amber)
- `--code-operator`: `#93c5fd` (blue)
- `--code-punctuation`: `#a8a7b3` (secondary text)

### Theme System

13 themes available. Activate via `[data-theme="theme-name"]` on root.
Daylight (light mode) included — overrides all surface/text/border tokens.
All themes share component patterns — only token values change.

**Dark themes**: Obsidian, Default, Amber, Verdant, Glacier, Aurora, Spatial, Matrix, Neon, Carbon, Plasma, Circuit
**Light themes**: Daylight

### Animations

Entrance: `.anim-fade-in`, `.anim-fade-in-up`, `.anim-slide-in-left`, `.anim-scale-in`
Looping: `.anim-pulse`, `.anim-glow`, `.anim-float`, `.anim-spin`, `.anim-shimmer`, `.anim-scanline`
Hover: `.hover-lift`, `.hover-glow`, `.hover-scale`
Stagger: `.delay-1` through `.delay-6` (50ms increments)
Code: `.typing-cursor` — blinking cursor

All respect `prefers-reduced-motion`. See `DESIGN.md` section 11.
