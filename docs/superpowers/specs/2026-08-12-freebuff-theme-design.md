# Freebuff Theme Rebrand — Design Spec

Date: 2026-08-12
Status: Approved by user

## Goal

Take visual style cues from **freebuff.com** (the free AI coding agent) and apply
them across the GitMind frontend — landing page and dashboard — with **exact
fidelity** to freebuff's palette.

## Reference identity (freebuff.com)

| Token | Value |
|-------|-------|
| Canvas bg | `#090a0f` (near-black, navy-slate undertone) |
| Card surfaces | `#111827` / `#131b2e` |
| Borders | `#1f2937` |
| Primary accent | Electric blue `#3b82f6` → hover `#60a5fa` |
| Gradient partner | Violet `#8b5cf6` (blue→violet gradients) |
| Text | `#f3f4f6` primary, `#9ca3af` muted |
| Type | Inter (headings/body), JetBrains Mono (code) |
| Radii | 12–16px cards, fully-rounded pills |
| Signature patterns | Glassmorphism nav (blur 12px), white→blue gradient hero text, translucent pill badges, blue glow focus states |

## Approach

**Freebuff becomes the default theme** (Approach A, user-selected). The root
token set (currently the "Obsidian" default) is recolored to freebuff's exact
palette. All other themes in the theme switcher remain untouched. Because every
component styles off `--primary` / `--surface-*` / `--accent` aliases, the
dashboard restyles automatically.

## Design decisions

1. **Color system** — Rewrite the root `:root` token block in
   `frontend/src/design-tokens.css`:
   - `--bg: #090a0f`, `--bg-alt: #06070b`
   - Surfaces: `#101216 / #14161c / #1a1d26 / #21242f / #2a2e3b`
   - `--primary: #3b82f6`, `--primary-hover: #60a5fa`, `--primary-strong: #2f6fe4`
   - New `--accent-2: #8b5cf6` and `--accent-gradient: linear-gradient(135deg, #3b82f6, #8b5cf6)` for freebuff's blue→violet moment
   - Text `#f3f4f6 / #9ca3af / #6b7280`; borders white-alpha + blue accent
   - Success/warning/danger/info unchanged (already freebuff-compatible)

2. **Typography** — Swap the font `<link>` in `frontend/public/index.html` from
   DM Sans/DM Mono to **Inter (300–700) + JetBrains Mono (400/500)**; update
   `--font-sans` / `--font-mono` tokens. Keep tight `-0.02em` heading tracking.

3. **Landing page signature**:
   - Hero title gradient: white → `#93c5fd` → `#a78bfa` (freebuff headline trick)
   - Orbs + particles retinted blue/violet
   - CTA button: blue→violet gradient pill with glow
   - Badge pill: blue-tinted translucent treatment

4. **Dashboard** — Flows from tokens. Sweep hardcoded hex values (severity
   `#f97316`, chart colors, old indigo `#7c6fe0`/`rgba(124,111,224,…)`) and map
   to the new palette. Severity "low" and info become blue.

5. **ThemeSwitcher** — Rename the default entry display name to "Freebuff"
   (sub: "Electric Blue + Violet", swatches `#090a0f` / `#3b82f6`). Internal id
   stays `obsidian` so `localStorage` and `uiReducer`'s `removeAttribute`
   behavior keep working.

## Out of scope

- Other 12 themes (default, amber, verdant, glacier, aurora, spatial, daylight,
  matrix, neon, carbon, plasma, circuit) — untouched
- PDF export styling (`pdfBuilder.js`)
- Backend

## Verification

- `npm run build` compiles
- Full Jest suite passes
- Lint clean on touched files
