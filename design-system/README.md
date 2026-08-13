# GitMind — Midnight Studio Design System

A reusable Claude Design package for the GitMind code intelligence platform.
Deep navy foundations, single indigo accent, polished dark UI.

## Product Overview

GitMind is a code intelligence platform that analyzes Git repositories to surface architectural patterns, security vulnerabilities, and code quality metrics. It is a desktop web application built for developers and security engineers.

**Core capabilities:**
- Repository health scoring with letter grades (A–F)
- Security vulnerability scanning with severity-ranked findings
- Architecture diagram generation from code structure
- PR review with inline code annotations
- Real-time stat tiles for commits, contributors, coverage, and issues
- Crisis chat for guided remediation

**Primary surfaces:**
- Dashboard summary — health score, stat tiles, findings table, activity feed
- Security analysis — vulnerability list with severity badges
- Architecture diagrams — dependency graphs and module relationships
- PR review — code diff with inline comments
- Code audit — file-by-file issue breakdown
- Crisis chat — real-time remediation guidance

**Design direction:** Midnight Studio — professional dark UI replacing "hacker terminal green-on-dark" with restrained sophistication. Deep navy (`#08090e`), layered surfaces, single indigo accent (`#7c6fe0`).

## Source Context

- **Source Project**: GitMind Frontend Refactor (73d76dc3-6777-487b-9587-6b228c3be8cb)
- **Linked Directories**: `/Users/mac/projects/Git-Mind/frontend`, `/Users/mac/projects/Git-Mind`
- **Brand Spec**: `brand-spec.md` — original palette, typography, spacing, radii, elevation
- **Provenance**: `context/provenance.md` — token source traceability from source files
- **Evidence Files**: `brand-spec.md`, `gitmind-design-system.html`, `gitmind-redesign-summary.md`

## Package Contents

```
├── DESIGN.md                          # Complete design system documentation
├── README.md                          # This file — package guide
├── SKILL.md                           # Skill definition for AI agents
├── colors_and_type.css                # Extracted CSS custom properties + base reset
├── brand-spec.md                      # Original brand specification
├── brand.json                         # Machine-readable token export (JSON)
├── theme.json                         # Per-theme token maps (13 themes)
├── context/
│   ├── source-context.md              # Source project metadata
│   └── provenance.md                  # Token and asset provenance
├── preview/
│   ├── colors-primary.html            # Color palette card
│   ├── typography-specimens.html      # Type scale specimen
│   ├── spacing-tokens.html            # Spacing, radii, elevation
│   ├── components-buttons.html        # Buttons, badges, inputs, cards
│   ├── themes-swatches.html           # All 13 theme swatches
│   ├── nav-rail.html                  # Navigation rail + content panel
│   └── animations.html                # Motion, hover, stagger, cursor effects
├── ui_kits/
│   ├── kit.html                       # Standalone component kit (dark, theme-switchable)
│   ├── kit.light.html                 # Standalone component kit (light/Daylight mode)
│   └── app/
│       ├── index.html                 # Applied interface kit
│       └── README.md                  # Applied kit documentation
└── gitmind-design-system.html         # Full source design system (reference)
```

## Preview Cards

| Card | File | Content |
|------|------|---------|
| Colors | `preview/colors-primary.html` | Core palette — surfaces, accent, semantic, text |
| Typography | `preview/typography-specimens.html` | Full type scale with live specimens |
| Spacing | `preview/spacing-tokens.html` | 7-step spacing, radii, elevation shadows |
| Components | `preview/components-buttons.html` | Buttons, badges, inputs, grade card, stat tiles |
| Themes | `preview/themes-swatches.html` | 13 theme swatches with preview strips |
| Navigation | `preview/nav-rail.html` | Nav rail + content panel pattern |
| Animations | `preview/animations.html` | Entrance, looping, hover, stagger, cursor effects |

## Preserved Assets

No runtime/build assets or font files were present in the source project.
Typography loads from Google Fonts at runtime (Geist 300–700, Geist Mono 400–500).
The full source design system reference is preserved at `gitmind-design-system.html`.

## UI Kit

`ui_kits/app/index.html` is a complete applied interface demonstrating the design system in context.
It loads `../../colors_and_type.css` for token consistency and includes nav rail, top bar, stat tiles, data table, grade card, and activity feed.
See `ui_kits/app/README.md` for component inventory and reuse instructions.

## Package Reuse and Review Guide

This section consolidates everything needed to reuse this design system package.

### Source and Context References

- **Source project**: GitMind Frontend Refactor (`73d76dc3-6777-487b-9587-6b228c3be8cb`)
- **Linked directories**: `/Users/mac/projects/Git-Mind/frontend`, `/Users/mac/projects/Git-Mind`
- **Brand spec**: `brand-spec.md` — original palette, typography, spacing, radii, elevation
- **Provenance**: `context/provenance.md` — token source traceability from source files
- **Evidence files**: `brand-spec.md`, `gitmind-design-system.html`, `gitmind-redesign-summary.md`

### Package Contents

Core files:
- `DESIGN.md` — Complete design system documentation (color, type, spacing, layout, components, motion, voice, themes, anti-patterns)
- `colors_and_type.css` — Extracted CSS custom properties, base reset, light mode override set, print styles
- `brand-spec.md` — Original brand specification with theme system
- `SKILL.md` — Skill definition for AI agents

Context and provenance:
- `context/source-context.md` — Source project metadata
- `context/provenance.md` — Token and asset provenance

### Preview Cards

| Card | File | Content |
|------|------|---------|
| Colors | `preview/colors-primary.html` | Core palette — surfaces, accent, semantic, text |
| Typography | `preview/typography-specimens.html` | Full type scale with live specimens |
| Spacing | `preview/spacing-tokens.html` | 7-step spacing, radii, elevation shadows |
| Components | `preview/components-buttons.html` | Buttons, badges, inputs, grade card, stat tiles |
| Themes | `preview/themes-swatches.html` | 13 theme swatches with preview strips |
| Navigation | `preview/nav-rail.html` | Nav rail + content panel pattern |
| Animations | `preview/animations.html` | Entrance, looping, hover, stagger, cursor effects |

### Preserved Assets, Fonts, and Build Artifacts

No runtime/build assets or font files were present in the source project.
Typography loads from Google Fonts at runtime (Geist 300–700, Geist Mono 400–500).
The full source design system reference is preserved at `gitmind-design-system.html`.

### UI Kit

`ui_kits/app/index.html` — Complete applied interface demonstrating the design system in context.
Loads `../../colors_and_type.css` for token consistency.
Includes nav rail, top bar, stat tiles, data table, grade card, and activity feed.
See `ui_kits/app/README.md` for component inventory, layout architecture, and reuse instructions.

### Concrete Reuse Steps

1. Copy `colors_and_type.css` into your project's first `<style>` block
2. Import Geist (300–700) and Geist Mono (400–500) from Google Fonts
3. Follow component patterns in `DESIGN.md` section 6
4. Reference preview cards in `preview/` for visual spec
5. Use `ui_kits/app/index.html` as reference for full layout patterns
6. For light mode, add `[data-theme="daylight"]` to root — CSS includes full override set
7. For code syntax, use token vars: `--code-keyword`, `--code-string`, `--code-fn`, etc.
8. For tooling integration, import `brand.json` (tokens) or `theme.json` (per-theme maps)
9. For standalone component preview, open `ui_kits/kit.html` (dark) or `ui_kits/kit.light.html` (light)

### Review Workflow

1. Open `preview/colors-primary.html` — verify palette matches brand spec
2. Open `preview/typography-specimens.html` — verify type scale renders correctly
3. Open `preview/spacing-tokens.html` — verify spacing, radii, shadows
4. Open `preview/components-buttons.html` — verify all component variants
5. Open `preview/themes-swatches.html` — verify all 13 theme swatches
6. Open `preview/animations.html` — verify entrance, looping, hover, and stagger animations
7. Open `ui_kits/app/index.html` — verify full applied interface
