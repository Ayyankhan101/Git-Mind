# GitMind Frontend — Styling Reference

## Stack
- Pure CSS with CSS custom properties (`src/index.css`), Tailwind installed but unused
- Icons: `lucide-react`
- Fonts: `"DM Sans"` (sans, weights 300–700) / `"DM Mono"` (mono, weights 400–500) via Google Fonts

## Layout
```
.app grid: 48px nav-rail | 1fr main
          52px command-bar | 1fr content
          height: 100vh
```

## Theme system
`data-theme` on `<html>` | 3 density modes via `data-density`: comfortable / compact / spacious

| Theme    | BG        | Primary   | Type            |
|----------|-----------|-----------|-----------------|
| obsidian | `#09090b` | `#7c6fe0` | default dark    |
| daylight | `#fafafa` | `#6366f1` | light           |
| amber    | `#1a1612` | `#f59e0b` | warm dark       |
| verdant  | `#0a100d` | `#10b981` | forest dark     |
| glacier  | `#0b1220` | `#38bdf8` | cool blue dark  |
| aurora   | `#0a0a18` | `#a78bfa` | glass dark      |
| mist     | `#eef1f8` | `#6366f1` | glass light     |

### CSS vars (all themes share these keys)
bg, surface, surface-2, surface-3, border, border-2, primary, primary-dim, primary-glow, success, warning, danger, info, sev-critical, sev-high, sev-medium, sev-low, text-1, text-2, text-3, code

Glass themes (aurora, mist) also set: chrome-bg, chrome-blur (backdrop-filter), bloom-1/2/3

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
48px wide, vertical icon bar with tooltips (11px/500), `.nav-item` active state uses primary color, `.nav-badge` for counts

### Command bar
52px tall, contains wordmark (14px/700) + chrome UI items, `.cb-input` (13px), `.cb-status` (12px)

### Tabs
`.tab` 12.5px/500, `.tab.active` uses primary, `.tab-badge` 11px/500

### Cards (repo, stat, endpoint)
Surface-based panels with border, `.repo-card` has title + desc + lang color dot, `.stat` has value (32px) + label (11px uppercase), `.endpoint` has route (15px mono) + method badge (11px/700 mono)

### Rows
`.row` with title (15px/500) + sub (14px) + path (13px mono), `.row.critical/high/medium/low` uses sev-* colors for left border

### Panels
- `.chat-wrap` — conversation panel
- `.crisis-panel` — slides in from right (gm-slide-right 0.22s)
- `.repo-drawer` — slides up from bottom (gm-drawer-up 0.22s)
- `.palette` — command palette popover (gm-palette-in 0.12s)
- `.toast` — notification slide in (gm-toast-in 0.18s)

### Shadows
Dropdowns: `0 18px 40px rgba(0,0,0,0.45)` | Modals: `0 36px 72px rgba(0,0,0,0.55)` | Toasts: `0 8px 24px rgba(0,0,0,0.35)`

### Scrollbar
6px wide, thumb uses border-2 / text-3 on hover

### Focus
`button:focus-visible, input:focus-visible` — 2px solid primary outline +2px offset
