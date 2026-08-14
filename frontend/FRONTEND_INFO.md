# GitMind Frontend — Styling Reference

## Stack

- Pure CSS with CSS custom properties (`src/index.css`), Tailwind installed but unused
- Icons: `@phosphor-icons/react`, wrapped by `src/icons.js` (replaces the former lucide-react import)
- Fonts: `"Geist"` (sans, weights 300–700) / `"Geist Mono"` (mono, weights 400–500) via Google Fonts

## Layout

```
.app grid: 52px nav-rail | 1fr main     (nav-rail expands to 180px on hover)
           48px command-bar | 1fr content
           height: 100vh
```

## Theme system

`data-theme` on `<html>` | 3 density modes via `data-density`: comfortable / compact / spacious

| Theme     | BG        | Primary   | Type           |
| --------- | --------- | --------- | -------------- |
| obsidian  | `#090a0f` | `#3b82f6` | default dark   |
| default   | `#0a0f1e` | `#8b5cf6` | navy dark      |
| daylight  | `#f8fafc` | `#3b82f6` | light          |
| amber     | `#1a1208` | `#d4a74a` | warm dark      |
| verdant   | `#081208` | `#22c55e` | forest dark    |
| glacier   | `#0a0f14` | `#22d3ee` | cool blue dark |
| aurora    | `#0f0a18` | `#a855f7` | violet dark    |
| spatial   | `#050508` | `#22d3ee` | near-black     |
| matrix    | `#0a0f0a` | `#00ff41` | green terminal |
| neon      | `#0a0010` | `#ff006e` | pink electric  |
| carbon    | `#111111` | `#ffffff` | graphite       |
| plasma    | `#08041a` | `#a855f7` | violet         |
| circuit   | `#0f0d08` | `#f59e0b` | amber tech     |

`obsidian` is the default and has no CSS file — its palette is baked into the
base `:root` tokens in `design-tokens.css`. The other 12 themes live in
`src/themes/*.css` and are lazy-loaded per-theme by `src/themeLoader.js`.

### CSS vars (defined in `design-tokens.css`, overridden per theme)

Surfaces: `--bg`, `--bg-alt`, `--surface-0` … `--surface-4`
Borders: `--border-subtle`, `--border-default`, `--border-strong`, `--border-accent`
Text: `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-on-primary`
Accent: `--primary`, `--primary-hover`, `--primary-strong`, `--primary-muted`, `--primary-subtle`, `--accent-2`
Semantic: `--success`, `--warning`, `--danger`, `--info` (each with a `-bg` variant)
Glass: `--glass-bg`, `--glass-border`
Code: `--code-keyword/string/comment/fn/number/operator/punctuation`

Also: spacing `--space-xs`…`--space-3xl`, radii `--radius-sm`…`--radius-full`, shadows `--shadow-sm/md/lg/accent`, durations `--duration-fast/normal/slow`, fonts `--font-sans/--font-mono`, type scale `--fs-3xs`…`--fs-3xl`

### Typography

body 15px/400 sans | .t-label 11px/600 0.12em uppercase | .t-mono 13px mono | stat-value 32px/600 | crisis-timer 56px mono | nav-badge 10px/700 | tab 12.5px/500

### Buttons

- `.btn` — base with padding, radius, weight 500
- `.btn-primary` — solid primary bg, white text
- `.btn-ghost` — transparent, border, hover border-2
- `.btn-icon` — 28×28, transparent, hover surface-2
- `.btn-text` — no border/bg
- disabled: opacity 0.35, cursor not-allowed

### Nav rail

52px wide, vertical icon bar with tooltips (11px/500), `.nav-item` active state uses primary color, `.nav-badge` for counts; expands to 180px on hover, labels stagger in (transition-delay per item)

### Landing page

`src/components/LandingPage.jsx` + `LandingPage.css` — editorial marketing page shown pre-analysis.

- Hero: split-screen — left: headline (`lp-hero-title`), subcopy (`lp-hero-sub`), CTA (`lp-cta-btn`); right: live health-grade preview card (`lp-hero-preview`) + decorative agent radar (`lp-bento-agents`, `.lp-bento-agent`)
- `lp-stats` strip: value/label pairs
- `lp-how-steps` (how-it-works): numbered step cards (`lp-how-step`, `lp-how-step-num`) with connecting line
- Mobile: `.lp-nav-hamburger` (3-line hamburger → X when open), collapsible mobile menu
- Footer `lp-footer`: brand, theme switcher, GitHub link

### Theme switcher

`src/components/ThemeSwitcher.jsx` — grid of 13 theme swatches, rendered in the command bar's token popover AND the landing footer. `src/themeLoader.js` lazy-loads per-theme CSS from `src/themes/*.css`.

### Command bar

48px tall, contains wordmark (14px/700) + chrome UI items, `.cb-input` (13px), `.cb-status` (12px); hosts the token popover (theme grid + density control) opened from the wordmark/chrome area

### Tabs

`.tab` 12.5px/500, `.tab.active` uses primary, `.tab-badge` 11px/500

### Cards (repo, stat, endpoint)

Surface-based panels with border, `.repo-card` has title + desc + lang color dot, `.stat` has value (32px) + label (11px uppercase), `.endpoint` has route (15px mono) + method badge (11px/700 mono)

### Rows

`.row` with title (15px/500) + sub (14px) + path (13px mono), `.row.critical/high/medium/low` uses sev-\* colors for left border

### Panels

- `.chat-wrap` — conversation panel
- `.crisis-panel` — slides in from right (gm-slide-right 0.22s)
- `.repo-drawer` — slides up from bottom (gm-drawer-up 0.22s)
- `.palette` — command palette popover (gm-palette-in 0.12s)
- `.toast` — notification slide in (gm-toast-in 0.18s)

### Shadows

Token-driven (dark palette): `--shadow-sm: 0 1px 2px`, `--shadow-md: 0 4px 12px`, `--shadow-lg: 0 8px 32px`, `--shadow-accent: 0 4px 20px rgba(59,130,246,0.22)`. Cards combine `--shadow-sm` + `--inner-highlight`; modals use `--shadow-lg`.

### Scrollbar

6px wide, thumb uses border-2 / text-3 on hover

### Focus

`button:focus-visible, input:focus-visible` — 2px solid primary outline +2px offset
