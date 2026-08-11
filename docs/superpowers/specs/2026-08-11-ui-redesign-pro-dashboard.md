# GitMind UI Redesign — Pro Dashboard

## Overview
Full UI overhaul from glassmorphism/animated aesthetic to a Grafana/Datadog-inspired pro dashboard. Single dark theme + light mode toggle. All features retained.

## 1. Color System

### Dark mode tokens
```
--bg:        #0f1117    --surface:    #161921
--elevated:  #1c2030    --hover:      #232838
--border-s:  #1e2128    --border-m:   #2a2f3e
--border-h:  #363c50
--text-1:    #e1e4eb    --text-2:     #9498a8    --text-3: #5c6070
--accent:    #3b82f6    --success:    #22c55e
--warning:   #f59e0b    --danger:     #ef4444    --info: #a855f7
```

### Light mode tokens
```
--bg:        #ffffff    --surface:    #f8f9fb
--elevated:  #f0f1f5    --hover:      #e8eaef
--border-s:  #e2e4ea    --border-m:   #d0d3dc
--border-h:  #b8bcc8
--text-1:    #1a1d27    --text-2:     #5c6070    --text-3: #9498a8
--accent:    #3b82f6    --success:    #16a34a
--warning:   #d97706    --danger:     #dc2626    --info: #9333ea
```

### Removed
All glass tokens, bloom tokens, gradient vars, aurora/amber/verdant/glacier/spatial/mist themes. Theme toggle saves to localStorage.

## 2. Layout Architecture

```
+-------------------------------------------------+
| Top Bar (48px, fixed)                           |
| [Logo] [Repo v] [Cmd+K Search] [Dark/Light]    |
+--------+----------------------------------------+
| Side   | Main Content Area                      |
| bar    | (scrollable)                           |
| (52px) |                                        |
| Icons  |                                        |
| only   |                                        |
+--------+----------------------------------------+
| Status Bar (28px, fixed) -- progress, timestamp |
+-------------------------------------------------+
```

- Sidebar: 52px icon rail. Hover expands to 180px with labels. Active tab: colored left border + bg tint.
- Top bar: Fixed. Logo, repo selector, search, theme toggle, avatar.
- Status bar: Fixed bottom. Scan progress, last scan time, branch.

## 3. Landing Page

Full viewport. Dark bg with subtle animated grid (faint lines, slow drift, 60s cycle). Centered: logo, tagline, repo input + Analyze button, Recent Repos row (3-4 cards).

No chrome orb, no gradient text, no particles, no scanlines, no blobs. Only animation: grid drift, button hover lift, input focus ring.

## 4. Dashboard Tabs

Each tab: dense data cards with consistent pattern.

- Security: Severity filter pills with counts, finding cards (color left border, title, file:line, description, Fix/Simulate buttons)
- Code Audit: Language bar, expandable per-language sections, findings
- PR Review: PR list with status badges, diff summary + review actions
- CVE: Sortable table (CVE ID, severity, package, version, fix, description)
- Crisis: Chat-like scenario/response interface
- Diagram: Force-directed graph (nodes by file type, edges by relationship)
- Chat: Clean bubble interface with code highlighting
- 3D Graph: Simplified Three.js, no bloom, fewer particles

## 5. Typography

- UI labels: Inter or system sans-serif, 12-13px
- Data values: JetBrains Mono or monospace, 12-13px
- Headings: Inter semibold, 16-20px
- No decorative fonts

## 6. Animations

Minimal. Only:
- Grid drift on landing (60s cycle, very subtle)
- Button hover lift (translateY -1px, 150ms)
- Input focus ring (200ms)
- Tab content fade-in (200ms)
- Loading spinner (standard CSS)

Removed: Orb float, chrome ball rotation, scanline sweep, particle burst, bloom post-processing, phase pulse, shimmer bars

## 7. Implementation Order

1. Tokens and base CSS (index.css)
2. Layout shell (top bar, sidebar, status bar)
3. Landing page (hero with grid bg, input, recent repos)
4. Tab components (restyle each)
5. 3D graph (simplify)
6. Theme toggle (dark/light)
7. Cleanup (delete removed files)
8. Verify (build, browser check)

## 8. Success Criteria

- Build passes with zero warnings
- All 10 tabs functional and styled
- Dark + light mode both work
- No glassmorphism, no gradients, no heavy animations
- Dense data display, monospace for code/data
- Responsive (768px, 480px breakpoints)
