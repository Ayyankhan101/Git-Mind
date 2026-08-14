# GitMind — Midnight Studio Design System

> Category: Project Design System
> Surface: web
> Origin: GitMind Frontend Refactor (73d76dc3-6777-487b-9587-6b228c3be8cb)

## Source Context

| Field | Value |
|-------|-------|
| Source Project | GitMind Frontend Refactor |
| Source ID | 73d76dc3-6777-487b-9587-6b228c3be8cb |
| Linked Dirs | `/Users/mac/projects/Git-Mind/frontend`, `/Users/mac/projects/Git-Mind` |
| Evidence Files | `brand-spec.md`, `gitmind-design-system.html`, `gitmind-redesign-summary.md` |
| Token Provenance | All hex values from `brand-spec.md` palette + `gitmind-design-system.html` `:root` |
| Typography Source | Google Fonts: Geist (300–700), Geist Mono (400–500) |
| Theme Count | 13 (Obsidian default, Default, Amber, Verdant, Glacier, Aurora, Spatial, Daylight, Matrix, Neon, Carbon, Plasma, Circuit) |
| Product | Code intelligence — repo analysis, security, architecture, code quality |
| Surface | Desktop web app with nav rail, dashboard, code blocks, stat tiles |

## 1. Visual Theme & Atmosphere

**Midnight Studio** — polished professional dark UI for a code intelligence platform. Deep navy foundations (`#08090e`), layered surface hierarchy, single indigo accent (`#7c6fe0`). Replaces "hacker terminal green-on-dark" with restrained sophistication.

Product context: GitMind analyzes repositories to surface architectural patterns, security vulnerabilities, and code quality metrics. The design system supports a desktop web app with navigation rail, dashboard panels, code blocks, and data-dense stat tiles.

Core feelings: focused, technical, calm authority. Not flashy. Not playful. Serious tool for serious work.

## 2. Color

### Core Palette

| Token | Hex | Role |
|-------|-----|------|
| `--bg` | `#08090e` | Page background |
| `--bg-alt` | `#06070c` | Alternate background |
| `--surface-0` | `#0d0e16` | Card base |
| `--surface-1` | `#11121c` | Elevated surfaces |
| `--surface-2` | `#161824` | Input backgrounds |
| `--surface-3` | `#1c1e2e` | Hover states |
| `--surface-4` | `#232538` | Active states |

### Accent (Single — Indigo Only)

| Token | Hex | Role |
|-------|-----|------|
| `--primary` | `#7c6fe0` | Buttons, links, focus |
| `--primary-hover` | `#8b7fe8` | Hover accent |
| `--primary-strong` | `#6b5fd4` | Active/pressed accent |
| `--primary-muted` | `rgba(124,111,224,0.15)` | Muted accent fill |
| `--primary-subtle` | `rgba(124,111,224,0.08)` | Subtle accent fill |

### Semantic

| Token | Hex | Role |
|-------|-----|------|
| `--success` | `#34d399` | Passing, positive |
| `--warning` | `#fbbf24` | Caution |
| `--danger` | `#f87171` | Critical, error |
| `--info` | `#60a5fa` | Informational |

Each semantic color has a `-bg` variant at 8% opacity for fills.

### Text

| Token | Hex | Role |
|-------|-----|------|
| `--text-primary` | `#f0eff4` | Headings, key values |
| `--text-secondary` | `#a8a7b3` | Body text |
| `--text-tertiary` | `#6d6c7a` | Labels, captions |
| `--text-on-primary` | `#08090e` | Text on accent buttons |

### Borders

| Token | Value | Role |
|-------|-------|------|
| `--border-subtle` | `rgba(255,255,255,0.04)` | Default dividers |
| `--border-default` | `rgba(255,255,255,0.06)` | Input borders |
| `--border-strong` | `rgba(255,255,255,0.10)` | Elevated borders |
| `--border-accent` | `rgba(124,111,224,0.25)` | Focus rings, active borders |

### Glass

| Token | Value |
|-------|-------|
| `--glass-bg` | `rgba(13,14,22,0.7)` |
| `--glass-border` | `rgba(255,255,255,0.06)` |

## 3. Typography

### Font Stacks

- **Sans**: `'Geist', -apple-system, BlinkMacSystemFont, sans-serif`
- **Mono**: `'Geist Mono', 'SF Mono', monospace`

### Type Scale

| Role | Weight | Size | Tracking | Usage |
|------|--------|------|----------|-------|
| Display | 700 | 48px | -0.025em | Hero headlines |
| H1 | 600 | 36px | -0.02em | Page titles |
| H2 | 600 | 28px | -0.01em | Section headings |
| H3 | 500 | 20px | normal | Subsection headings |
| Body | 400 | 16px | -0.006em | Paragraphs, descriptions |
| Small | 400 | 14px | normal | Secondary text |
| Caption | 400 | 12px | 0.06em uppercase | Labels, metadata |
| Mono | 400 | 15px | normal | Code, technical values |

### Rules

- Display and body use different weight treatments (700 vs 400)
- Caption always uppercase with wide tracking
- Line height: 1.55 body, 1.2 headings
- Body text max-width: 65ch

## 4. Spacing

### Scale (7-step)

| Token | Value |
|-------|-------|
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 16px |
| `--space-lg` | 24px |
| `--space-xl` | 32px |
| `--space-2xl` | 48px |
| `--space-3xl` | 64px |

Never use arbitrary pixel values. All spacing derives from this scale.

### Radii

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Small elements, badges |
| `--radius-md` | 10px | Buttons, inputs |
| `--radius-lg` | 16px | Cards, panels |
| `--radius-xl` | 24px | Feature cards, grade cards |
| `--radius-full` | 999px | Pills, badges |

### Elevation

| Token | Shadow |
|-------|--------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.4)` |
| `--shadow-lg` | `0 8px 32px rgba(0,0,0,0.5)` |
| `--shadow-accent` | `0 4px 20px rgba(124,111,224,0.2)` |

## 5. Layout & Composition

### Page Structure

- Max-width: 1200px centered
- Section spacing: `--space-3xl` (64px)
- Hero: centered text, bottom border separator
- Sections labeled with mono uppercase labels ("01 — Palette")

### Navigation Pattern

- **Nav Rail**: 64px wide vertical sidebar, `--surface-1` background
- **Nav Items**: 44×44px touch targets, icon-only, `--radius-md` rounded
- **Active state**: `--primary-muted` background + `--border-accent` inset ring + `--primary` icon color
- **Hover state**: `--surface-2` background
- **Content area**: fills remaining space, `--surface-1` background

### Grid Systems

- **Palette**: `repeat(auto-fill, minmax(160px, 1fr))`
- **Components**: `repeat(auto-fill, minmax(320px, 1fr))`
- **Stats**: `repeat(auto-fill, minmax(180px, 1fr))`
- **Themes**: `repeat(auto-fill, minmax(240px, 1fr))`

### Responsive Behavior

- Breakpoint: 768px
- Mobile: single-column, reduce display type, nav rail becomes horizontal
- Touch targets: minimum 44px

## 6. Components

### Buttons

| Variant | Background | Text | Border | Usage |
|---------|-----------|------|--------|-------|
| Primary | `--primary` | `--text-on-primary` | transparent | Main CTA |
| Secondary | `--surface-2` | `--text-primary` | `--border-strong` | Secondary actions |
| Ghost | transparent | `--text-secondary` | transparent | Tertiary actions |
| Danger | `--danger` | `#fff` | transparent | Destructive actions |
| Disabled | `--surface-2` | `--text-tertiary` | `--border-subtle` | Unavailable |

Sizes: `btn-sm` (6px/14px), default (10px/20px), `btn-lg` (14px/28px).

Focus: 2px `--primary` outline, 2px offset.

### Badges

Pill-shaped, 12px font, 4px/10px padding. Variants: primary, success, warning, danger, info. Each uses semantic color text + semantic-bg fill + 20% opacity border.

### Inputs

- `--surface-1` background, `--border-default` border
- Focus: `--primary` border + `--primary-subtle` 3px ring
- Mono variant for code values
- Label: 13px, `--text-secondary`

### Grade Card

Feature card for health scores. `--radius-xl`, `--surface-1` background, 3px `--primary` top bar. Large letter grade (4rem, 700), stat grid below.

### Stat Tiles

Compact data cards. Large value (2rem, 600), label, optional change badge (positive `--success`, negative `--danger`).

### Code Block

`--surface-0` background, `--radius-md`, Geist Mono 13px. Syntax colors: keyword `#c4b5fd`, string `#a5d6a7`, comment `--text-tertiary`, function `#93c5fd`, number `--warning`.

## 7. Motion & Interaction

### Durations

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-fast` | 120ms | Hover, focus |
| `--duration-normal` | 200ms | Transitions |
| `--duration-slow` | 350ms | Page transitions |

### Easing

- Default: `cubic-bezier(0.16, 1, 0.3, 1)` — fast start, gentle settle

### Hover States

- Cards: `translateY(-2px)` + `--shadow-lg`
- Buttons: background shift to `-hover` variant + `--shadow-accent`
- Theme cards: `translateY(-2px)` + `--border-accent`

### Active/Pressed

- Buttons: background shift to `-strong` variant + `scale(0.98)`
- Theme cards: `scale(0.98)`

### Focus

- 2px solid `--primary` outline, 2px offset
- Inputs: 3px `--primary-subtle` ring

### Reduced Motion

Respect `prefers-reduced-motion: reduce`. Set all animation/transition durations to 0.01ms.

## 8. Voice & Brand

### Copy Style

- Technical, precise, no marketing fluff
- Uppercase mono labels for section markers ("01 — Palette")
- Short descriptive phrases, not full sentences in UI elements
- Terminology: "Scan Repository", "Security Analysis", "Architecture Diagram"

### Capitalization

- Headlines: Title Case
- Labels: UPPERCASE (mono, tracked)
- Body: Sentence case

### Tone

Professional tool for developers. Not playful. Not corporate. Direct and competent.

## 9. Anti-patterns

### Never Do

- Multiple accent colors competing on one screen
- Purple gradient washes or gradient-on-everything
- Emoji as functional icons
- Hover states that make text gray or lighter
- Hand-drawn SVG people or scenes
- Multiple solid primary CTAs in one viewport
- Inter, Roboto, or Arial as display typeface
- Arbitrary pixel values (use the spacing scale)
- Warm beige/cream backgrounds
- Control panels that exist only for the designer
- Light text on light backgrounds or dark on dark
- `white-space: nowrap` to force text into adjacent elements
- Charts with empty outlines only (no filled data encoding)
- Text overlays that cross image edges or cover main subjects
- `scrollIntoView` in embedded preview contexts
- Hotlinking user-uploaded images by URL

### Contrast Requirements

- Normal text: 4.5:1 minimum
- Large text/icons: 3:1 minimum
- Focus rings must be visible on all interactive elements
- Disabled is the only state allowed to reduce contrast

## 10. Theme System

### Available Themes

| Theme | Bg | Surface | Accent | Text | Character |
|-------|-----|---------|--------|------|-----------|
| **Obsidian** (default) | `#08090e` | `#0d0e16` | `#7c6fe0` | `#f0eff4` | Navy + Indigo |
| Default | `#0a0f1e` | `#111827` | `#8b5cf6` | `#f9fafb` | Deep blue + Violet |
| Amber | `#1a1208` | `#1f170a` | `#d4a74a` | `#faf5eb` | Dark brown + Amber |
| Verdant | `#081208` | `#0d1a0d` | `#22c55e` | `#f0fdf4` | Dark forest + Emerald |
| Glacier | `#0a0f14` | `#0f1620` | `#22d3ee` | `#f0fdfa` | Dark slate + Cyan |
| Aurora | `#0f0a18` | `#150f20` | gradient | `#faf5ff` | Multi-gradient accent |
| Spatial | `#050508` | `#0a0a10` | `#22d3ee` | `#ecfeff` | Deep black + Cyan |
| **Daylight** | `#fafafa` | `#f5f5f5` | `#7c6fe0` | `#18181b` | White + Indigo |
| **Matrix** | `#0a0f0a` | `#0d120d` | `#00ff41` | `#d4ffd4` | Terminal green |
| **Neon** | `#0a0010` | `#0f0018` | `#ff006e` | `#fff0f5` | Cyberpunk pink + cyan |
| **Carbon** | `#111111` | `#1a1a1a` | `#ffffff` | `#ffffff` | Pure monochrome |
| **Plasma** | `#08041a` | `#0c0622` | `#a855f7` | `#f0eaff` | Electric purple + blue |
| **Circuit** | `#0f0d08` | `#141209` | `#f59e0b` | `#fef3c7` | Amber/gold tech |

### Theme Token Mapping

Each theme overrides these CSS custom properties:
- `--bg`, `--bg-alt`, `--surface-0` through `--surface-4`
- `--primary`, `--primary-hover`, `--primary-strong`, `--primary-muted`, `--primary-subtle`
- `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-on-primary`
- `--border-subtle`, `--border-default`, `--border-strong`, `--border-accent`
- `--glass-bg`, `--glass-border`
- `--shadow-sm/md/lg`, `--shadow-accent`

### Light Mode (Daylight)

Daylight theme inverts the dark paradigm:
- Backgrounds shift to white/gray scale
- Text shifts to near-black (`#18181b`)
- Shadows become lighter (lower opacity)
- Semantic colors shift to deeper saturations for contrast
- Code syntax colors adjust for light backgrounds
- Activate via `[data-theme="daylight"]` or `.daylight` class on root

### Theme Selection Rules

- One theme per viewport
- Theme changes propagate via CSS custom property overrides
- Aurora uses `linear-gradient(135deg, #a855f7, #22d3ee)` for accent — only theme with gradient accent
- All themes share the same component patterns — only token values change
- Respect `prefers-color-scheme` for automatic Daylight/Obsidian selection

## 11. Animations

### Keyframes

| Name | Effect | Usage |
|------|--------|-------|
| `fadeIn` | Opacity 0→1 | General entrance |
| `fadeInUp` | Opacity + translateY(12px) | Card/list entrance |
| `fadeInDown` | Opacity + translateY(-12px) | Dropdown/tooltip entrance |
| `slideInLeft` | Opacity + translateX(-16px) | Nav/sidebar entrance |
| `slideInRight` | Opacity + translateX(16px) | Panel entrance |
| `scaleIn` | Opacity + scale(0.95) | Modal/popover entrance |
| `pulse` | Opacity oscillation | Loading indicators |
| `glow` | Box-shadow oscillation | Accent emphasis |
| `glowBorder` | Border-color oscillation | Active item focus |
| `shimmer` | Background position sweep | Loading skeleton |
| `scanline` | Vertical sweep | CRT/terminal effect |
| `typing` | Width expansion | Text reveal |
| `blink` | Opacity toggle | Cursor indicator |
| `float` | translateY oscillation | Subtle idle motion |
| `rotate` | 360deg rotation | Spinner |
| `gradientShift` | Background-position cycle | Animated gradients |

### Utility Classes

**Entrance animations** (apply to elements on load):
- `.anim-fade-in`, `.anim-fade-in-up`, `.anim-fade-in-down`
- `.anim-slide-in-left`, `.anim-slide-in-right`, `.anim-scale-in`

**Looping animations** (continuous):
- `.anim-pulse` — opacity pulse (2s)
- `.anim-glow` — accent glow (2s)
- `.anim-glow-border` — border glow (2s)
- `.anim-float` — gentle float (3s)
- `.anim-spin` — rotation (1s)
- `.anim-shimmer` — skeleton loading (2s)
- `.anim-scanline` — CRT scanline overlay (3s)

**Stagger delays** (combine with entrance animations):
- `.delay-1` through `.delay-6` (50ms increments)

**Hover effects** (combine with interactive elements):
- `.hover-lift` — translateY(-2px) + shadow-lg
- `.hover-glow` — accent glow on hover
- `.hover-scale` — scale(1.02) on hover

**Code block**:
- `.typing-cursor` — blinking cursor after element

### Animation Rules

- All animations respect `prefers-reduced-motion: reduce` (already in base CSS)
- Entrance animations use `both` fill mode — element stays in final state
- Never animate layout properties (width, height) — use transform instead
- Keep durations under 350ms for interactive feedback
- Stagger delays max 300ms — beyond that feels sluggish
- Glow effects use `--primary-muted` and `--primary-subtle` — never full opacity
