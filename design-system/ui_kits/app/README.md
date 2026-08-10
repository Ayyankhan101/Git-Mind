# UI Kit — Applied Interface

Applied GitMind interface kit demonstrating the Midnight Studio design system in context.
Loads `../../colors_and_type.css` for token consistency.
Designed for reuse by future agents building similar dark-themed code intelligence UIs.

## Package Reuse and Review Guide

### Applied Kit Structure

```
ui_kits/app/
├── index.html      # Full dashboard layout — nav rail, top bar, stats, table, grade card, activity feed
└── README.md       # This file
```

The kit is a single self-contained HTML file with all CSS inline (tokens inherited from `colors_and_type.css`).
No build step required — open directly in a browser.

### Component Files

| Component | Location in `index.html` | Description |
|-----------|--------------------------|-------------|
| Nav Rail | Left sidebar | 64px wide, 44px touch targets, active/hover/focus states |
| Top Bar | Header | Title, search with ⌘K shortcut, user avatar |
| Stat Tiles | 4-column responsive grid | Values, labels, change badges (positive/negative) |
| Data Table | Findings list | Severity badges, file paths, status columns |
| Grade Card | Health score panel | Letter grade, stats grid, accent top bar |
| Activity Feed | Timeline | Colored status dots, descriptions, timestamps |
| Badges | Inline elements | Success/warning/danger with dot indicators |
| Buttons | Various | Primary CTA, ghost secondary |

### Usage Workflow

1. Open `index.html` in a browser to see the full applied interface
2. Inspect nav rail interaction states — hover, active, focus-visible
3. Verify stat tiles render with correct design tokens
4. Check table badge colors match semantic token values
5. Confirm grade card uses primary accent correctly
6. Test responsive breakpoints at 768px

### Design Notes

- All tokens inherited from `colors_and_type.css` via CSS custom properties
- Responsive: stat grid collapses to 2 columns, content grid to single column at 768px
- Respects `prefers-reduced-motion: reduce` — all transitions set to 0.01ms
- Focus-visible outlines on all interactive elements (2px `--primary`, 2px offset)
- Touch targets minimum 44px (nav items are 44×44px)
- Single primary CTA per viewport — ghost buttons for secondary actions

### Source Basis

Derived from `gitmind-design-system.html` navigation and component patterns.
Layout structure mirrors the GitMind app's dashboard view.
All colors, spacing, typography, and radii follow the token definitions in `DESIGN.md`.
Component shapes match the reference component manifest in `DESIGN.md` section 6.
