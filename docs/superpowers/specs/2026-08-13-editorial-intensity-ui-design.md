# GitMind Editorial Intensity — Design Spec

Date: 2026-08-13
Status: Approved by user

## Goal

Sharpen the GitMind frontend (landing page + dashboard) toward the editorial,
award-gallery energy of sites curated on recent.design — oversized editorial
typography, asymmetric composition, a color-blocked structural moment, and one
signature visual. **Refine what exists; do not rebuild.** The token system, all
13 themes, radii, spacing scale, and Geist/Geist Mono stay untouched.

## Reference identity (recent.design ethos)

| Quality | Expression |
|---------|------------|
| Editorial type | Oversized display headlines, tight tracking, magazine-spread scale |
| Asymmetric layout | Staggered baselines, copy-left / object-right, unequal column widths |
| Structural markers | Big mono section numerals — used only where content is a real sequence |
| Color blocking | Full-bleed solid color bands with the largest numerals on the page |
| Signature moment | One memorable, animated element that embodies the product |

## Approach

**Editorial Intensity (Approach A, user-selected).** The landing page becomes a
poster for the product; the dashboard receives precision passes. Everything
styles off the existing tokens (`--primary`, `--surface-*`, `--accent`,
`--text-*`) so all 13 themes keep working with no theme-file edits.

## Design decisions

### 1. Hero — asymmetric, oversized type

- Layout flips from balanced `1fr 1fr` to an editorial stagger: copy at ~58%
  width on the left, report preview on the right dropped down ~48px (staggered
  baseline, magazine-spread feel).
- Title scales up to `clamp(40px, 6.5vw, 76px)`, tracking `-0.045em`, line-height
  ~0.98. Accent line ("Ship confidence.") stays accent-colored.
- Eyebrow badge: mono uppercase, wider tracking (`0.12em`+). Sub-line gets a
  max-width for editorial measure (keep ~440px).

### 2. Signature moment — agent radar sweep (CSS-only)

- Behind the hero copy: concentric rings + a rotating conic-gradient sweep in
  `--primary-muted` / `--primary-subtle` at ~8% opacity, echoing the
  AgentPipeline motif from the bento tile. Ties the "6 AI agents" story to the
  hero.
- Implementation: a dedicated absolutely-positioned `.lp-hero-radar` element
  (pure CSS `@keyframes` rotate, `border` rings, `conic-gradient`), `z-index`
  below copy, `pointer-events: none`.
- Disabled entirely under `prefers-reduced-motion` and hidden on
  `max-width: 768px`.

### 3. Structure — color-blocked stats, real numbering

- **Stats band:** replace the hairline-strip with a full-bleed color-blocked
  band — `--primary-strong` background, values at 64px / weight 800 in
  `--text-on-primary` with `font-variant-numeric: tabular-nums`, labels at
  white ~70% opacity. (Verified accessible in all themes: Daylight
  `#1d4ed8`/white, dark themes' `--primary-strong` + `--text-on-primary`.)
- **Section numbering:** oversized mono numerals (`01`, `02`, `03`) used only
  where content is a genuine sequence — the 3 how-it-works steps. Implement as
  large ghost numerals behind each step card (~96px, mono, `--accent` at low
  opacity). Features do NOT get fake numbering.
- **Bento:** flagship "6 AI Agents" tile becomes the largest card (spans all 6
  columns) with the live AgentPipeline animation; remaining tiles keep the
  4+2 / 2+2+2 rhythm.

### 4. Dashboard — precision passes (no rebuild)

- **Active nav item:** add a 3px `--primary` left-edge indicator to the existing
  active state (primary-muted bg + border ring already present).
- **Meta-strip:** repo path in mono, tighter separators, tabular numerals.
- **Stat tiles + grade card:** values bumped a step with tighter tracking;
  `font-variant-numeric: tabular-nums` everywhere numbers appear.
- **Tab headers:** consistent uppercase mono eyebrows with hairline rules under
  section titles (the "01 — Palette" pattern already in the design system).
- **Empty/error states:** brief direction-setting copy pass — empty tabs invite
  an action instead of showing blank.

## Out of scope

- Theme files (`frontend/src/themes/*.css`) — no edits; tokens provide all color
- PDF export styling (`pdfBuilder.js`)
- Backend
- No new dependencies (radar is pure CSS)
- No structural JSX changes to the dashboard flow (only class/CSS + minor copy)

## Files touched (expected)

- `frontend/src/components/LandingPage.jsx` — hero markup, radar element,
  section numeral markup, stats band markup
- `frontend/src/components/LandingPage.css` — hero stagger, display scale,
  radar keyframes, stats band, ghost numerals, bento flagship span
- `frontend/src/index.css` — dashboard precision passes (nav active edge,
  meta-strip mono, tabular-nums, tab eyebrows, empty-state copy styles)
- Possibly `frontend/src/components/NavRail.jsx` (active indicator) and
  dashboard components that render stat tiles/headers

## Verification

- `npm run build` compiles
- Full Jest suite passes (`npm test`)
- Manual: radar disabled under reduced motion + mobile; stats band readable in
  Daylight and Obsidian; active nav indicator visible
