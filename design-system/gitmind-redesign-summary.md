# GitMind Frontend Redesign — Complete

## Design Direction: Midnight Studio

Replaced "hacker terminal green-on-dark" with polished professional aesthetic.

## Color System

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#08090e` | Deep navy base |
| `--surface-1` | `#0d0e16` | Elevated cards |
| `--surface-2` | `#13151f` | Hover states |
| `--border-subtle` | `rgba(255,255,255,0.04)` | Default borders |
| `--border-default` | `rgba(255,255,255,0.06)` | Active borders |
| `--primary` | `#7c6fe0` | Indigo accent |
| `--primary-hover` | `#8b7fe8` | Accent hover |
| `--primary-strong` | `#6b5fd4` | Accent active |
| `--text-primary` | `#f0eff4` | Headings |
| `--text-secondary` | `#a8a7b3` | Body text |
| `--text-tertiary` | `#6d6c7a` | Muted |
| `--text-on-primary` | `#08090e` | Text on accent |

## Typography

- **Sans**: Inter (300-700)
- **Code**: JetBrains Mono (400-500)

## Files Modified

| File | Change |
|------|--------|
| `src/index.css` | Complete rewrite (6221→~1100 lines) |
| `src/components/LandingPage.css` | Updated color references |
| `src/components/LoadingExperience/LoadingExperience.css` | Updated color references |
| `src/components/SecurityTab.jsx` | Updated inline colors |
| `src/components/CveTab.jsx` | Updated inline colors |
| `src/components/PRReviewTab.jsx` | Updated inline colors |
| `src/components/CodeAuditTab.jsx` | Updated inline colors |
| `src/components/CrisisChat.jsx` | Updated inline colors |
| `src/utils/parseGraphJson.js` | Updated HTTP method colors |
| `src/components/ThemeSwitcher.jsx` | Updated theme swatches |

## Themes Redefined

1. **Obsidian** — Default dark (navy + indigo)
2. **Default** — Alt dark (deep blue + violet)
3. **Amber** — Warm (dark brown + amber)
4. **Verdant** — Nature (dark forest + emerald)
5. **Glacier** — Cool (dark slate + cyan)
6. **Aurora** — Colorful (dark + multi-gradient)
7. **Spatial** — Glass (deep black + cyan)
8. **Daylight** — Light mode (white + indigo)
9. **Mist** — Soft light (off-white + muted indigo)
