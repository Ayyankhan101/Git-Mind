# GitMind — Midnight Studio Brand Spec

## Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg` | `#08090e` | Page background |
| `--surface-0` | `#0d0e16` | Card base |
| `--surface-1` | `#11121c` | Elevated surfaces |
| `--surface-2` | `#161824` | Input backgrounds |
| `--surface-3` | `#1c1e2e` | Hover states |
| `--surface-4` | `#232538` | Active states |
| `--primary` | `#7c6fe0` | Accent — buttons, links, focus |
| `--primary-hover` | `#8b7fe8` | Hover accent |
| `--primary-strong` | `#6b5fd4` | Active/pressed accent |
| `--success` | `#34d399` | Passing, positive |
| `--warning` | `#fbbf24` | Caution |
| `--danger` | `#f87171` | Critical, error |
| `--info` | `#60a5fa` | Informational |
| `--text-primary` | `#f0eff4` | Headings, key values |
| `--text-secondary` | `#a8a7b3` | Body text |
| `--text-tertiary` | `#6d6c7a` | Labels, captions |

## Typography

| Role | Font | Weight | Size | Tracking |
|------|------|--------|------|----------|
| Display | Geist | 700 | 48px | -0.03em |
| H1 | Geist | 600 | 36px | -0.02em |
| H2 | Geist | 600 | 28px | -0.01em |
| H3 | Geist | 500 | 20px | normal |
| Body | Geist | 400 | 16px | -0.006em |
| Small | Geist | 400 | 14px | normal |
| Caption | Geist | 400 | 12px | 0.06em (uppercase) |
| Mono | Geist Mono | 400 | 15px | normal |

## Spacing Scale

4px · 8px · 16px · 24px · 32px · 48px · 64px

## Radii

| Token | Value |
|-------|-------|
| `--radius-sm` | 6px |
| `--radius-md` | 10px |
| `--radius-lg` | 16px |
| `--radius-xl` | 24px |
| `--radius-full` | 999px |

## Elevation

| Token | Shadow |
|-------|--------|
| `--shadow-sm` | 0 1px 2px rgba(0,0,0,0.3) |
| `--shadow-md` | 0 4px 12px rgba(0,0,0,0.4) |
| `--shadow-lg` | 0 8px 32px rgba(0,0,0,0.5) |
| `--shadow-accent` | 0 4px 20px rgba(124,111,224,0.2) |

## Principles

1. **Single accent** — Indigo only. No competing accent colors.
2. **Surface hierarchy** — 6 surfaces from bg to elevated. Cards use `surface-0`, inputs use `surface-1`.
3. **Text tiers** — 3 text colors. Primary for headings, secondary for body, tertiary for labels.
4. **Glass morphism** — Subtle backdrop blur on overlays, not heavy.
5. **Intentional spacing** — 7-step scale. Never arbitrary pixel values.
6. **Motion** — 120ms/200ms/350ms durations. `ease-out` curve. Respect `prefers-reduced-motion`.

## Themes

| Theme | Bg | Accent | Character |
|-------|-----|--------|-----------|
| Obsidian (default) | `#08090e` | `#7c6fe0` | Navy + Indigo |
| Default | `#0a0f1e` | `#8b5cf6` | Deep blue + Violet |
| Amber | `#1a1208` | `#d4a74a` | Dark brown + Amber |
| Verdant | `#081208` | `#22c55e` | Dark forest + Emerald |
| Glacier | `#0a0f14` | `#22d3ee` | Dark slate + Cyan |
| Aurora | `#0f0a18` | gradient | Multi-gradient accent |
| Spatial | `#050508` | `#22d3ee` | Deep black + Cyan |
| Daylight | `#fafafa` | `#7c6fe0` | White + Indigo (light mode) |
| Matrix | `#0a0f0a` | `#00ff41` | Terminal green |
| Neon | `#0a0010` | `#ff006e` | Cyberpunk pink + cyan |
| Carbon | `#111111` | `#ffffff` | Pure monochrome |
| Plasma | `#08041a` | `#a855f7` | Electric purple + blue |
| Circuit | `#0f0d08` | `#f59e0b` | Amber/gold tech |

Activate via `[data-theme="name"]` on root element.
