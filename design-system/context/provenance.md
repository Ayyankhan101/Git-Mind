# Provenance — GitMind Midnight Studio Design System

## Source Project

- **Name**: GitMind Frontend Refactor
- **ID**: 73d76dc3-6777-487b-9587-6b228c3be8cb
- **Linked Directories**:
  - `/Users/mac/projects/Git-Mind/frontend`
  - `/Users/mac/projects/Git-Mind`

## Copied Files

| File | Size | Content |
|------|------|---------|
| `brand-spec.md` | 2KB | Complete palette, typography, spacing, radii, elevation, principles |
| `gitmind-design-system.html` | 47KB | Full working design system with tokens, components, states, navigation, themes |
| `gitmind-redesign-summary.md` | 2KB | Color system, theme list, modified files |

## Token Provenance

### Colors

All hex values extracted directly from `brand-spec.md` palette table and `gitmind-design-system.html` `:root` block. No values invented.

| Token | Source |
|-------|--------|
| `--bg` #08090e | brand-spec.md + design-system.html |
| `--surface-0` #0d0e16 | brand-spec.md + design-system.html |
| `--surface-1` #11121c | brand-spec.md + design-system.html |
| `--surface-2` #161824 | brand-spec.md + design-system.html |
| `--surface-3` #1c1e2e | brand-spec.md + design-system.html |
| `--surface-4` #232538 | brand-spec.md + design-system.html |
| `--primary` #7c6fe0 | brand-spec.md + design-system.html |
| `--primary-hover` #8b7fe8 | brand-spec.md + design-system.html |
| `--primary-strong` #6b5fd4 | brand-spec.md + design-system.html |
| `--success` #34d399 | brand-spec.md + design-system.html |
| `--warning` #fbbf24 | brand-spec.md + design-system.html |
| `--danger` #f87171 | brand-spec.md + design-system.html |
| `--info` #60a5fa | brand-spec.md + design-system.html |
| `--text-primary` #f0eff4 | brand-spec.md + design-system.html |
| `--text-secondary` #a8a7b3 | brand-spec.md + design-system.html |
| `--text-tertiary` #6d6c7a | brand-spec.md + design-system.html |

### Typography

- Inter (300–700): Google Fonts, used in design-system.html
- JetBrains Mono (400–500): Google Fonts, used in design-system.html

### Derived Values

- `--primary-muted`: 15% opacity of `--primary`, from design-system.html
- `--primary-subtle`: 8% opacity of `--primary`, from design-system.html
- `--text-on-primary`: `--bg` value, from design-system.html
- Border rgba values: from design-system.html `:root`

## Themes

Nine themes documented in `gitmind-redesign-summary.md`:

1. Obsidian — Default dark (navy + indigo)
2. Default — Alt dark (deep blue + violet)
3. Amber — Warm (dark brown + amber)
4. Verdant — Nature (dark forest + emerald)
5. Glacier — Cool (dark slate + cyan)
6. Aurora — Colorful (dark + multi-gradient)
7. Spatial — Glass (deep black + cyan)
8. Daylight — Light mode (white + indigo)
9. Mist — Soft light (off-white + muted indigo)

## No Additional Assets

No logo files, app icons, tray icons, avatars, wordmarks, imagery, or font files were present in the source project files. The design system relies on Google Fonts for typography.
