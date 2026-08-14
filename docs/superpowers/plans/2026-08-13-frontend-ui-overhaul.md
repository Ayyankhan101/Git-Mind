# GitMind Frontend UI Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform GitMind's frontend from "built by engineer" to "designed by designer" — adding atmosphere to the dashboard, elevating the landing page hero, extracting inline styles to the token system, cleaning up overloaded UI, and polishing responsive behavior.

**Architecture:** CSS-first approach. Most improvements are styling changes on existing components — no new dependencies. Each task is independently deployable. Tasks are ordered by impact and dependency: atmosphere first (pure CSS), then structural layout changes, then cleanup.

**Tech Stack:** React 19, CSS custom properties (design tokens), Tailwind CSS 4, GSAP 3.15, Phosphor Icons, Geist + Geist Mono typography.

## Global Constraints

- React 19.2.8, react-scripts 5.0.1 (CRA, no Vite)
- Tailwind CSS 4.3.3 via `@tailwindcss/postcss`
- All colors via CSS custom properties from `design-tokens.css` — never hardcode hex
- 13 themes must keep working — test each change in at least 2 themes (e.g. `default` dark + `daylight` light)
- `prefers-reduced-motion` must be respected for all animations
- No new npm dependencies — CSS-only improvements
- Phosphor Icons (`@phosphor-icons/react`) for any new icons
- Geist font family: `var(--font-sans)` for body, `var(--font-mono)` for code/mono
- Filenames: CSS modules not used — all plain `.css` files with BEM-like prefixes (`lp-` for landing, no prefix for dashboard)

---

## File Map

| File | Role | Tasks |
|------|------|-------|
| `frontend/src/index.css` | Dashboard shell, all component styles (4979 lines) | 1, 4, 5, 6 |
| `frontend/src/design-tokens.css` | Token definitions (455 lines) | 1 |
| `frontend/src/components/LandingPage.css` | Landing page styles (1264 lines) | 2, 3 |
| `frontend/src/components/LandingPage.jsx` | Landing page JSX (731 lines) | 2, 3, 7 |
| `frontend/src/components/DashboardLayout.jsx` | Dashboard shell JSX (521 lines) | 1, 4 |
| `frontend/src/components/CommandBar.jsx` | Top bar (142 lines) | 5 |
| `frontend/src/components/NavRail.jsx` | Nav rail (114 lines) | 6 |
| `frontend/src/components/Sidebar.jsx` | Sidebar (657 lines) | 4 |
| `frontend/src/components/ThemeSwitcher.jsx` | Theme picker (191 lines) | 5 |

---

### Task 1: Dashboard Atmosphere Layer

**Goal:** Add depth, texture, and ambient light to the flat dashboard shell so it matches the landing page's visual richness.

**Files:**
- Modify: `frontend/src/index.css:523-533` (`.main` rule)
- Modify: `frontend/src/index.css:623-638` (`.card` rule)
- Modify: `frontend/src/index.css:251-265` (`.command-bar` rule)

**Interfaces:**
- Consumes: `--bg`, `--surface`, `--primary`, `--border-s`, `--inner-highlight`, `--shadow-sm`, `--shadow-md` from `design-tokens.css`
- Produces: No API changes — pure CSS. Later tasks rely on the enhanced card/command-bar styles.

- [ ] **Step 1: Add ambient gradient to `.main`**

Open `frontend/src/index.css`. Find the `.main` rule (line ~523). Replace:

```css
.main {
  grid-column: 2;
  grid-row: 2;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
}
```

With:

```css
.main {
  grid-column: 2;
  grid-row: 2;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
  /* Ambient gradient: subtle radial glow from top-right corner,
     tinted toward the current theme's accent color. Costs nothing
     (paint server, not layout). */
  background:
    radial-gradient(
      ellipse 60% 50% at 85% 10%,
      var(--primary-subtle) 0%,
      transparent 70%
    ),
    var(--bg);
}
```

- [ ] **Step 2: Add film-grain overlay to dashboard**

After the `.main` rule in `index.css`, add a new rule:

```css
/* Film grain overlay — same technique as landing page. Fixed +
   pointer-events-none means zero scroll repaint cost. */
.main::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.015;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 160px 160px;
}
```

- [ ] **Step 3: Enhance `.card` hover with shadow escalation**

Find the `.card` rule (line ~623). After the existing `.card:hover` rule, update it:

```css
.card:hover {
  border-color: var(--border-m);
  box-shadow:
    var(--shadow-sm),
    var(--inner-highlight);
  transform: translateY(-1px);
}
```

Also add transition for transform on the base `.card` rule. Find the `.card` base and add `transform` to the transition:

```css
.card {
  background: var(--surface);
  border: 1px solid var(--border-s);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: var(--inner-highlight);
  transition:
    border-color var(--duration-fast),
    box-shadow var(--duration-fast),
    transform var(--duration-fast);
}
```

- [ ] **Step 4: Add glass effect to `.command-bar`**

Find the `.command-bar` rule (line ~252). Update:

```css
.command-bar {
  grid-column: 1 / -1;
  grid-row: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 16px;
  background: var(--glass-bg, var(--surface));
  border-bottom: 1px solid var(--border-s);
  backdrop-filter: blur(12px) saturate(1.2);
  position: sticky;
  top: 0;
  z-index: 50;
}
```

Note: `--glass-bg` is defined in all themes (e.g. `rgba(9, 10, 15, 0.7)` in freebuff). The fallback `var(--surface)` handles themes that don't define it.

- [ ] **Step 5: Visual inspection — verify in 3 themes**

Run: `cd frontend && npm start`

Open the dashboard in browser. Switch themes via the theme switcher:
1. **Freebuff** (default dark) — check ambient gradient is subtle blue in top-right
2. **Daylight** (light mode) — check grain overlay is visible, card hover lift works
3. **Matrix** (high-contrast dark) — check glass command bar doesn't break readability

Verify: Cards lift on hover, command bar has frosted glass, main area has subtle gradient, grain is barely visible.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(dashboard): add atmosphere layer — ambient gradient, film grain, card hover lift, glass command bar"
```

---

### Task 2: Landing Page Hero Redesign

**Goal:** Replace the generic centered hero with a split-screen layout — left: typography + input, right: live report preview. This is the single highest-impact visual change.

**Files:**
- Modify: `frontend/src/components/LandingPage.jsx:554-574` (hero section JSX)
- Modify: `frontend/src/components/LandingPage.css:147-210` (hero CSS)
- Modify: `frontend/src/components/LandingPage.jsx:263-332` (move ReportPreview into hero)
- Test: `frontend/src/components/LandingPage.test.jsx`

**Interfaces:**
- Consumes: `HealthCard` component, `SAMPLE_HEALTH`, `REPORT_STATS`, `REPORT_FINDINGS` data from `LandingPage.jsx`
- Produces: No API changes — layout only. Task 3 modifies sections below the hero.

- [ ] **Step 1: Write failing test for hero structure**

Open `frontend/src/components/LandingPage.test.jsx`. Add a test that checks for the split-screen layout:

```javascript
it("renders hero with split-screen layout", () => {
  const { container } = render(
    <LandingPage onLoad={() => {}} onAnalyzeUrl={() => {}} />
  );
  const hero = container.querySelector(".lp-hero");
  expect(hero).toBeTruthy();
  // Split-screen: hero should contain both copy and preview panels
  const copy = hero.querySelector(".lp-hero-copy");
  const preview = hero.querySelector(".lp-hero-preview");
  expect(copy).toBeTruthy();
  expect(preview).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx react-scripts test --testPathPattern="LandingPage" --watchAll=false`

Expected: FAIL — `.lp-hero-copy` and `.lp-hero-preview` don't exist yet.

- [ ] **Step 3: Restructure hero JSX**

Open `frontend/src/components/LandingPage.jsx`. Find the hero section (line ~554). Replace the entire `<section className="lp-hero">` block with:

```jsx
{/* ── Hero ─────────────────────────────────────────────── */}
<section className="lp-hero" ref={heroRef}>
  <div className="lp-hero-inner">
    <div className="lp-hero-copy">
      <div className="lp-badge">AI-Powered Code Intelligence</div>
      <h1 className="lp-hero-title">
        <span className="lp-title-line">Understand code.</span>
        <br />
        <span className="lp-title-line lp-title-accent">
          Ship confidence.
        </span>
      </h1>
      <p className="lp-hero-sub">
        Analyze repositories for vulnerabilities, architecture patterns,
        and code quality — powered by 6 AI agents working in parallel.
      </p>
      <HeroForm
        onLoad={onLoad}
        onAnalyzeUrl={onAnalyzeUrl}
        inputRef={heroInputRef}
      />
    </div>
    <div className="lp-hero-preview">
      <div className="lp-hero-preview-window">
        <div className="lp-hero-preview-head">
          <span className="lp-hero-preview-repo">facebook/react</span>
          <span className="lp-hero-preview-tag">Sample output</span>
        </div>
        <HealthCard health={SAMPLE_HEALTH} />
        <div className="lp-hero-preview-stats">
          {REPORT_STATS.map(({ value, label, Icon }) => (
            <div key={label} className="lp-hero-preview-stat">
              <Icon size={13} />
              <span className="lp-hero-preview-stat-value">{value}</span>
              <span className="lp-hero-preview-stat-label">{label}</span>
            </div>
          ))}
        </div>
        <div className="lp-hero-preview-findings">
          {REPORT_FINDINGS.slice(0, 2).map((f) => (
            <div key={f.title} className={`finding-card ${f.sev}`}>
              <div className="finding-body">
                <div className="finding-title">{f.title}</div>
                <div className="finding-path">{f.path}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 4: Rewrite hero CSS for split-screen**

Open `frontend/src/components/LandingPage.css`. Find the `.lp-hero` rule (line ~147). Replace the entire hero CSS block (`.lp-hero` through `.lp-hero-btn:hover`) with:

```css
/* ── Hero (Split-Screen) ────────────────────────────────────── */
.lp-hero {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 88px 32px 72px;
  overflow: hidden;
}

.lp-hero-inner {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-items: center;
  max-width: 1100px;
  width: 100%;
  position: relative;
  z-index: 2;
}

.lp-hero-copy {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.lp-hero-preview {
  position: relative;
  animation: fadeSlideUp 0.8s ease-out 0.3s both;
}

.lp-hero-preview-window {
  background: var(--surface-0);
  border: 1px solid var(--lp-glass-border-bright);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow:
    var(--shadow-lg),
    var(--inner-highlight),
    0 0 0 1px rgba(0, 0, 0, 0.35);
}

.lp-hero-preview-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border-s);
}

.lp-hero-preview-repo {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
}

.lp-hero-preview-repo::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
}

.lp-hero-preview-tag {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-2);
  padding: 3px 8px;
  border-radius: var(--radius-full);
  border: 1px solid var(--lp-glass-border);
  background: var(--surface-1);
  margin-left: auto;
}

.lp-hero-preview-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 14px 0;
}

.lp-hero-preview-stat {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  font-size: 11px;
  color: var(--text-2);
}

.lp-hero-preview-stat-value {
  font-weight: 700;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.lp-hero-preview-stat-label {
  font-size: 10px;
  color: var(--text-3);
}

.lp-hero-preview-findings {
  display: grid;
  gap: 8px;
}

.lp-hero .finding-card {
  padding: 10px 12px;
}

/* Mobile: stack vertically */
@media (max-width: 768px) {
  .lp-hero-inner {
    grid-template-columns: 1fr;
    gap: 32px;
  }
  .lp-hero-preview {
    order: -1;
  }
  .lp-hero-preview-window {
    max-height: 320px;
    overflow: hidden;
  }
}
```

Also update `.lp-badge`, `.lp-hero-title`, `.lp-hero-sub` to remove `text-align: center` since the copy is now left-aligned:

```css
.lp-badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 16px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: #93c5fd;
  background: var(--accent-dim);
  border: 1px solid var(--border-accent);
  border-radius: var(--radius-full);
  text-transform: uppercase;
  animation: fadeSlideUp 0.6s ease-out both;
  width: fit-content;
}

.lp-hero-title {
  font-size: clamp(36px, 6vw, 60px);
  font-weight: 700;
  line-height: 1.08;
  letter-spacing: -0.04em;
  color: var(--text-1);
  margin: 0;
}

.lp-hero-sub {
  font-size: 17px;
  line-height: 1.65;
  color: var(--text-2);
  margin: 0;
  max-width: 480px;
}
```

Update `.lp-hero-input-group` to remove `text-align: center` constraint:

```css
.lp-hero-input-group {
  display: flex;
  gap: 8px;
  width: 100%;
  max-width: 480px;
  margin-top: 8px;
  animation: fadeSlideUp 0.6s ease-out 0.2s both;
}
```

- [ ] **Step 5: Remove the old ReportPreview section**

In `LandingPage.jsx`, find the `<ReportPreview />` component usage (line ~674) and remove it entirely. The report preview now lives inside the hero. Also remove the `ReportPreview` function definition (lines ~267-332) since it's no longer needed.

- [ ] **Step 6: Run tests to verify hero structure passes**

Run: `cd frontend && npx react-scripts test --testPathPattern="LandingPage" --watchAll=false`

Expected: PASS — new test finds `.lp-hero-copy` and `.lp-hero-preview`.

- [ ] **Step 7: Visual inspection**

Open landing page in browser. Verify:
- Left side: badge, headline, subtitle, input form — all left-aligned
- Right side: machined window with HealthCard, stats, findings
- On mobile (<768px): stacks vertically, preview on top
- Scroll parallax still works (GSAP `.lp-hero-content` selector — update if needed)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/LandingPage.jsx frontend/src/components/LandingPage.css frontend/src/components/LandingPage.test.jsx
git commit -m "feat(landing): redesign hero as split-screen with live report preview"
```

---

### Task 3: Landing Page Sections Polish

**Goal:** Improve the features grid visual hierarchy, replace boring "How It Works" cards, strengthen stats section, and remove the weak CTA section.

**Files:**
- Modify: `frontend/src/components/LandingPage.jsx:31-87` (FEATURES data)
- Modify: `frontend/src/components/LandingPage.jsx:576-671` (sections JSX)
- Modify: `frontend/src/components/LandingPage.css:342-637` (features/how/stats CSS)
- Test: `frontend/src/components/LandingPage.test.jsx`

**Interfaces:**
- Consumes: Hero layout from Task 2 (sections below hero)
- Produces: No API changes — layout/styling only

- [ ] **Step 1: Add live mini-agent pipeline to flagship feature tile**

In `LandingPage.jsx`, find the FEATURES array (line ~31). The first feature ("6 AI Agents in Parallel") has `visual: "agents"` and renders `<AgentPipeline />` as children. Verify this renders correctly — it should show the 6 agent dots pulsing.

No code change needed here — just verify the `AgentPipeline` component renders in the tile.

- [ ] **Step 2: Write test for "How It Works" flow layout**

Open `frontend/src/components/LandingPage.test.jsx`. Add:

```javascript
it("renders how-it-works with flow layout", () => {
  const { container } = render(
    <LandingPage onLoad={() => {}} onAnalyzeUrl={() => {}} />
  );
  const how = container.querySelector("#how-it-works");
  expect(how).toBeTruthy();
  const steps = how.querySelectorAll(".lp-how-step");
  expect(steps.length).toBe(3);
});
```

- [ ] **Step 3: Run test to verify it passes (existing structure)**

Run: `cd frontend && npx react-scripts test --testPathPattern="LandingPage" --watchAll=false`

Expected: PASS — steps already exist with class `.lp-how-step`.

- [ ] **Step 4: Restyle "How It Works" as horizontal flow with connecting line**

Open `frontend/src/components/LandingPage.css`. Find the `.lp-how-steps` rule (line ~592). Replace:

```css
.lp-how-steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 32px;
  position: relative;
  z-index: 2;
}
```

With:

```css
.lp-how-steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 32px;
  position: relative;
  z-index: 2;
}

/* Connecting line between steps */
.lp-how-steps::before {
  content: "";
  position: absolute;
  top: 40px;
  left: calc(16.67% + 16px);
  right: calc(16.67% + 16px);
  height: 2px;
  background: linear-gradient(
    90deg,
    var(--accent-dim),
    var(--accent),
    var(--accent-dim)
  );
  opacity: 0.4;
  z-index: 0;
}
```

Update `.lp-how-step` to add step numbers:

```css
.lp-how-step {
  text-align: center;
  padding: 32px 24px;
  border-radius: var(--radius-lg);
  background: var(--lp-glass-bg);
  border: 1px solid var(--lp-glass-border);
  opacity: 0;
  transform: translateY(16px);
  transition:
    border-color var(--duration-normal),
    opacity 0.5s ease-out var(--reveal-delay, 0s),
    transform 0.5s ease-out var(--reveal-delay, 0s);
  position: relative;
  z-index: 1;
}
```

- [ ] **Step 5: Update HowStep component to show step numbers**

In `LandingPage.jsx`, find the `HowStep` function (line ~249). Update:

```jsx
function HowStep({ title, desc, delay, step }) {
  const ref = useScrollReveal();
  return (
    <div
      ref={ref}
      className="lp-how-step"
      style={{ "--reveal-delay": `${delay}s` }}
    >
      <div className="lp-how-step-num">{step}</div>
      <h3 className="lp-how-step-title">{title}</h3>
      <p className="lp-how-step-desc">{desc}</p>
    </div>
  );
}
```

Update the usage (line ~653) to pass step numbers:

```jsx
<HowStep
  step="1"
  title="Enter a repo"
  desc="Paste a GitHub URL or type a username to browse repos."
  delay={0}
/>
<HowStep
  step="2"
  title="AI analyzes"
  desc="Six agents scan security, architecture, docs, CVEs, code quality in parallel."
  delay={0.12}
/>
<HowStep
  step="3"
  title="Get results"
  desc="Interactive reports with severity-ranked findings, fix suggestions, exportable PDFs."
  delay={0.24}
/>
```

Add CSS for step numbers in `LandingPage.css`:

```css
.lp-how-step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent-dim);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 16px;
}
```

- [ ] **Step 6: Strengthen stats section — larger numbers, no card containers**

In `LandingPage.css`, find `.lp-stats-grid` (line ~516). Replace:

```css
.lp-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}
```

With:

```css
.lp-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  border-top: 1px solid var(--lp-glass-border);
  border-bottom: 1px solid var(--lp-glass-border);
}
```

Update `.lp-stat-item`:

```css
.lp-stat-item {
  text-align: center;
  padding: 40px 20px;
  opacity: 0;
  transform: translateY(16px);
  transition:
    opacity 0.5s ease-out var(--reveal-delay, 0s),
    transform 0.5s ease-out var(--reveal-delay, 0s);
}

.lp-stat-item:not(:last-child) {
  border-right: 1px solid var(--lp-glass-border);
}
```

Update `.lp-stat-value` to be massive:

```css
.lp-stat-value {
  font-size: 42px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
  margin-bottom: 4px;
}
```

- [ ] **Step 7: Remove weak CTA section**

In `LandingPage.jsx`, find the CTA section (line ~677). Remove the entire `<section className="lp-cta">` block. The hero already has the primary CTA — this section is redundant filler.

Also remove the `.lp-cta` CSS rules from `LandingPage.css`.

- [ ] **Step 8: Run tests**

Run: `cd frontend && npx react-scripts test --testPathPattern="LandingPage" --watchAll=false`

Expected: PASS.

- [ ] **Step 9: Visual inspection**

Verify:
- Features grid: flagship tile has pulsing agent pipeline
- How It Works: 3 steps with connecting gradient line and numbered circles
- Stats: large numbers in a single horizontal strip with dividers, no card backgrounds
- No CTA section at bottom (just footer after report preview)

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/LandingPage.jsx frontend/src/components/LandingPage.css frontend/src/components/LandingPage.test.jsx
git commit -m "feat(landing): polish features grid, numbered how-it-works flow, bold stats strip, remove redundant CTA"
```

---

### Task 4: Extract Inline Styles to Token Classes

**Goal:** Move hardcoded inline `style={{}}` blocks in DashboardLayout and Sidebar to CSS classes using the existing design token system. This fixes theme consistency across all 13 themes.

**Files:**
- Modify: `frontend/src/components/DashboardLayout.jsx:209-263` (error/warning banners)
- Modify: `frontend/src/components/Sidebar.jsx:336-346,451-465,559-565` (error display, history cards, empty state)
- Modify: `frontend/src/index.css` (add extracted classes)
- Test: Visual inspection across themes

**Interfaces:**
- Consumes: Design tokens from `design-tokens.css` (`--danger`, `--warning`, `--text-3`, `--border`, etc.)
- Produces: CSS classes reusable by any component

- [ ] **Step 1: Add extracted CSS classes to index.css**

Open `frontend/src/index.css`. At the end of the file (before the closing comment), add:

```css
/* ── Extracted Inline Style Classes ─────────────────────────────
   These replace hardcoded style={{}} blocks so themes work correctly. */

/* Error/warning banners */
.error-banner-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  font-size: var(--fs-sm);
  border: 1px solid;
  margin-bottom: 8px;
}

.error-banner-inline--danger {
  border-color: var(--danger);
  background: var(--danger-bg);
  color: var(--danger);
}

.error-banner-inline--warning {
  border-color: var(--warning-border);
  background: var(--warning-bg);
  color: var(--warning);
}

/* Sidebar error display */
.sidebar-error {
  padding: 8px 14px;
  font-size: var(--fs-sm);
  color: var(--danger);
  border-bottom: 1px solid var(--border);
}

/* Sidebar history card meta */
.sidebar-history-meta {
  margin-top: 2px;
}

/* Sidebar empty state */
.sidebar-empty {
  padding: 40px 16px;
  text-align: center;
}

/* Meta strip (repo info bar) */
.meta-strip-flex {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-2);
  font-size: var(--fs-md);
}

/* Button text primary color */
.btn-text-primary {
  color: var(--primary);
  flex-shrink: 0;
  font-size: var(--fs-sm);
  font-weight: 600;
  white-space: nowrap;
}
```

- [ ] **Step 2: Extract DashboardLayout inline styles**

Open `frontend/src/components/DashboardLayout.jsx`. Find the error banner `style={{}}` blocks (lines ~209-263). Replace inline styles with classes:

For the danger error banner (line ~209):
```jsx
// Before:
<div className="error-banner" style={{ ... }}>

// After:
<div className="error-banner-inline error-banner-inline--danger">
```

For the warning banner (line ~242):
```jsx
// Before:
<div className="error-banner" role="status" style={{ borderColor: "var(--warning-border)", background: "var(--warning-bg)", color: "var(--warning)" }}>

// After:
<div className="error-banner-inline error-banner-inline--warning" role="status">
```

For the Retry button (line ~218):
```jsx
// Before:
<button className="btn-text" style={{ color: "var(--primary)", flexShrink: 0, fontSize: fs.sm, fontWeight: 600, whiteSpace: "nowrap" }}>

// After:
<button className="btn-text btn-text-primary">
```

- [ ] **Step 3: Extract Sidebar inline styles**

Open `frontend/src/components/Sidebar.jsx`. Find the error display (line ~336):

```jsx
// Before:
<div style={{ padding: "8px 14px", fontSize: fs.sm, color: "var(--danger)", borderBottom: "1px solid var(--border)" }}>

// After:
<div className="sidebar-error">
```

Find the history card meta (line ~464):
```jsx
// Before:
<div className="repo-meta" style={{ marginTop: 2 }}>

// After:
<div className="repo-meta sidebar-history-meta">
```

Find the empty state (line ~574):
```jsx
// Before:
<div className="empty" style={{ padding: "40px 16px" }}>

// After:
<div className="empty sidebar-empty">
```

- [ ] **Step 4: Visual inspection across themes**

Run: `cd frontend && npm start`

Switch between **Freebuff** (dark), **Daylight** (light), and **Amber** (warm dark). Verify:
- Error banners render with correct theme colors (red danger, amber warning)
- Sidebar error text is `var(--danger)` colored
- History cards have correct spacing
- Empty state is centered and readable
- No hardcoded colors that look wrong in any theme

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DashboardLayout.jsx frontend/src/components/Sidebar.jsx frontend/src/index.css
git commit -m "refactor: extract inline styles to token-based CSS classes for theme consistency"
```

---

### Task 5: CommandBar Cleanup + Theme Switcher Grid

**Goal:** Declutter the overloaded CommandBar by collapsing the token input into a popover, and upgrade the ThemeSwitcher from a plain list to a visual grid.

**Files:**
- Modify: `frontend/src/components/CommandBar.jsx:29-141` (top bar)
- Modify: `frontend/src/components/ThemeSwitcher.jsx:85-191` (theme picker)
- Modify: `frontend/src/index.css` (popover + grid styles)
- Test: Visual inspection

**Interfaces:**
- Consumes: `isValidGhToken` from `api.js`, `tokenManager` from `tokenManager.js`
- Produces: No API changes — UI only

- [ ] **Step 1: Add popover and theme grid CSS to index.css**

Append to `frontend/src/index.css`:

```css
/* ── Token Popover ──────────────────────────────────────────── */
.token-popover-wrap {
  position: relative;
}

.token-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 200;
  width: 280px;
  padding: 16px;
  background: var(--surface-1);
  border: 1px solid var(--border-m);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.token-popover-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}

.token-popover .cb-input {
  max-width: 100%;
  flex: 1;
}

/* ── Theme Grid Picker ──────────────────────────────────────── */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  padding: 6px;
}

.theme-grid-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background var(--duration-fast),
    border-color var(--duration-fast);
}

.theme-grid-item:hover {
  background: var(--hover);
}

.theme-grid-item.active {
  border-color: var(--accent);
  background: var(--accent-dim);
}

.theme-grid-swatch {
  display: flex;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid var(--border-s);
}

.theme-grid-swatch span {
  flex: 1;
}

.theme-grid-info {
  min-width: 0;
}

.theme-grid-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.theme-grid-sub {
  font-size: 10px;
  color: var(--text-3);
}
```

- [ ] **Step 2: Add token popover to CommandBar**

Open `frontend/src/components/CommandBar.jsx`. Add state for popover:

```jsx
import React, { useRef, useCallback, useState } from "react";
```

Add state inside the component:

```jsx
const [tokenOpen, setTokenOpen] = useState(false);
```

Replace the token input section (line ~62) with a popover pattern:

```jsx
<div className="token-popover-wrap">
  <button
    className="btn-icon"
    onClick={() => setTokenOpen((o) => !o)}
    title="GitHub token settings"
    aria-label="GitHub token"
    aria-expanded={tokenOpen}
  >
    <Lock
      size={14}
      style={{
        color: ghToken
          ? isValidGhToken(ghToken)
            ? "var(--primary)"
            : "var(--danger)"
          : "var(--text-3)",
      }}
    />
  </button>
  {tokenOpen && (
    <div className="token-popover">
      <label className="token-popover-label">GitHub Token (optional)</label>
      <div className="cb-input">
        <Lock size={14} style={{ color: "var(--text-3)", flexShrink: 0 }} />
        <input
          type="password"
          placeholder={
            ghToken && !isValidGhToken(ghToken)
              ? "unrecognized format"
              : "Paste personal access token"
          }
          aria-label="GitHub personal access token"
          autoComplete="off"
          spellCheck={false}
          value={ghToken}
          onChange={(e) => {
            dispatch({ type: "SET_GH_TOKEN", value: e.target.value });
            debouncedTokenSave(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") setTokenOpen(false);
          }}
        />
      </div>
    </div>
  )}
</div>
```

Remove the old inline token input `div.cb-input.cb-input--token` (line ~62-96).

- [ ] **Step 3: Upgrade ThemeSwitcher to grid layout**

Open `frontend/src/components/ThemeSwitcher.jsx`. Replace the `.theme-pop` content (line ~157) with a grid:

```jsx
{open && (
  <div
    className="theme-pop"
    role="listbox"
    aria-label="Theme picker"
    ref={listRef}
  >
    <div className="theme-grid">
      {THEMES.map((t, i) => (
        <div
          key={t.id}
          className={`theme-grid-item${theme === t.id ? " active" : ""}`}
          role="option"
          tabIndex={focusIdx === i ? 0 : -1}
          aria-selected={theme === t.id}
          onClick={() => selectTheme(t)}
          onFocus={() => setFocusIdx(i)}
        >
          <div className="theme-grid-swatch">
            <span style={{ background: t.swatches[0] }} />
            <span style={{ background: t.swatches[1] }} />
          </div>
          <div className="theme-grid-info">
            <div className="theme-grid-name">{t.name}</div>
            <div className="theme-grid-sub">{t.sub}</div>
          </div>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Visual inspection**

Verify:
- CommandBar: lock icon opens a popover with token input. Clicking outside closes it.
- ThemeSwitcher: shows 2-column grid of theme cards with larger swatches. Active theme has accent border.
- Token popover doesn't overflow the viewport on small screens.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CommandBar.jsx frontend/src/components/ThemeSwitcher.jsx frontend/src/index.css
git commit -m "feat(ui): declutter CommandBar with token popover, upgrade ThemeSwitcher to grid layout"
```

---

### Task 6: Navigation + Footer Polish

**Goal:** Add staggered label reveal on NavRail hover, improve footer with theme switcher and links, add mobile hamburger menu to landing page.

**Files:**
- Modify: `frontend/src/index.css:359-467` (nav rail styles)
- Modify: `frontend/src/components/LandingPage.jsx:509-551` (nav JSX)
- Modify: `frontend/src/components/LandingPage.jsx:700-721` (footer JSX)
- Modify: `frontend/src/components/LandingPage.css:53-144` (nav CSS)
- Modify: `frontend/src/components/LandingPage.css` (footer CSS)
- Test: Visual inspection + responsive

**Interfaces:**
- Consumes: ThemeSwitcher component from Task 5
- Produces: No API changes

- [ ] **Step 1: Add staggered label reveal to NavRail**

Open `frontend/src/index.css`. Find `.nav-label` (line ~433). Update:

```css
.nav-label {
  opacity: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
  transition: opacity var(--duration-normal) ease-in-out;
  pointer-events: none;
  white-space: nowrap;
}

/* Staggered reveal: each nav item gets increasing delay */
.nav-item:nth-child(1) .nav-label { transition-delay: 0ms; }
.nav-item:nth-child(2) .nav-label { transition-delay: 30ms; }
.nav-item:nth-child(3) .nav-label { transition-delay: 60ms; }
.nav-item:nth-child(4) .nav-label { transition-delay: 90ms; }
.nav-item:nth-child(5) .nav-label { transition-delay: 120ms; }
.nav-item:nth-child(6) .nav-label { transition-delay: 150ms; }
.nav-item:nth-child(7) .nav-label { transition-delay: 180ms; }
.nav-item:nth-child(8) .nav-label { transition-delay: 210ms; }
.nav-item:nth-child(9) .nav-label { transition-delay: 240ms; }
.nav-item:nth-child(10) .nav-label { transition-delay: 270ms; }
```

- [ ] **Step 2: Add mobile hamburger to landing page nav**

Open `frontend/src/components/LandingPage.jsx`. Add hamburger state:

```jsx
const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
```

In the nav JSX (line ~511), add a hamburger button:

```jsx
<nav className="lp-nav">
  <div className="lp-nav-inner">
    <div className="lp-nav-brand">
      {/* ... existing brand content ... */}
    </div>
    <button
      className="lp-nav-hamburger"
      onClick={() => setMobileMenuOpen((o) => !o)}
      aria-label="Toggle menu"
      aria-expanded={mobileMenuOpen}
    >
      <span className={`lp-nav-hamburger-line${mobileMenuOpen ? " open" : ""}`} />
      <span className={`lp-nav-hamburger-line${mobileMenuOpen ? " open" : ""}`} />
    </button>
    <div className={`lp-nav-links${mobileMenuOpen ? " mobile-open" : ""}`}>
      <a href="#features" className={`lp-nav-link${activeSection === "features" ? " lp-nav-link--active" : ""}`}>
        Features
      </a>
      <a href="#stats" className={`lp-nav-link${activeSection === "stats" ? " lp-nav-link--active" : ""}`}>
        Stats
      </a>
      <a href="#how-it-works" className={`lp-nav-link${activeSection === "how-it-works" ? " lp-nav-link--active" : ""}`}>
        How it works
      </a>
    </div>
  </div>
</nav>
```

- [ ] **Step 3: Add hamburger + mobile nav CSS**

Open `frontend/src/components/LandingPage.css`. Add after `.lp-nav-link--active`:

```css
/* Hamburger — hidden on desktop */
.lp-nav-hamburger {
  display: none;
  flex-direction: column;
  gap: 5px;
  padding: 8px;
  background: none;
  border: none;
  cursor: pointer;
}

.lp-nav-hamburger-line {
  display: block;
  width: 18px;
  height: 2px;
  background: var(--text-1);
  border-radius: 1px;
  transition: transform var(--duration-normal), opacity var(--duration-normal);
}

.lp-nav-hamburger-line.open:first-child {
  transform: translateY(3.5px) rotate(45deg);
}

.lp-nav-hamburger-line.open:last-child {
  transform: translateY(-3.5px) rotate(-45deg);
}

/* Mobile nav */
@media (max-width: 768px) {
  .lp-nav-hamburger {
    display: flex;
  }

  .lp-nav-links {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    flex-direction: column;
    padding: 12px 32px;
    background: var(--lp-glass-bg);
    backdrop-filter: var(--lp-glass-blur) saturate(1.4);
    border-bottom: 1px solid var(--lp-glass-border);
    transform: translateY(-10px);
    opacity: 0;
    pointer-events: none;
    transition:
      transform var(--duration-normal),
      opacity var(--duration-normal);
  }

  .lp-nav-links.mobile-open {
    transform: translateY(0);
    opacity: 1;
    pointer-events: auto;
  }
}
```

- [ ] **Step 4: Upgrade footer**

In `LandingPage.jsx`, find the footer (line ~700). Replace:

```jsx
<footer className="lp-footer">
  <div className="lp-footer-inner">
    <div className="lp-footer-brand">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
      <span>GitMind</span>
    </div>
    <div className="lp-footer-copy">Built with AI. Open source.</div>
  </div>
</footer>
```

With:

```jsx
<footer className="lp-footer">
  <div className="lp-footer-inner">
    <div className="lp-footer-left">
      <div className="lp-footer-brand">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        <span>GitMind</span>
      </div>
      <span className="lp-footer-sep">·</span>
      <span className="lp-footer-copy">Built with AI</span>
    </div>
    <div className="lp-footer-right">
      <ThemeSwitcher theme={landingTheme} dispatch={landingDispatch} />
      <a
        href="https://github.com/your-org/gitmind"
        target="_blank"
        rel="noopener noreferrer"
        className="lp-footer-link"
      >
        GitHub
      </a>
    </div>
  </div>
</footer>
```

Note: Import ThemeSwitcher at the top of `LandingPage.jsx`:

```jsx
import ThemeSwitcher from "./ThemeSwitcher";
```

And inside the LandingPage component, add:

```jsx
const [landingTheme, setLandingTheme] = useState(
  () => localStorage.getItem("gm-theme") || "default"
);
const landingDispatch = useCallback((action) => {
  if (action.type === "SET_THEME") {
    setLandingTheme(action.theme);
    document.documentElement.setAttribute("data-theme", action.theme);
    localStorage.setItem("gm-theme", action.theme);
  }
}, []);
```

- [ ] **Step 5: Add footer CSS**

In `LandingPage.css`, find `.lp-footer` and replace:

```css
.lp-footer {
  padding: 24px 0;
  border-top: 1px solid var(--lp-glass-border);
}

.lp-footer-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.lp-footer-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.lp-footer-brand {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  color: var(--text-1);
}

.lp-footer-sep {
  color: var(--text-3);
}

.lp-footer-copy {
  font-size: 12px;
  color: var(--text-3);
}

.lp-footer-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.lp-footer-link {
  font-size: 12px;
  color: var(--text-3);
  text-decoration: none;
  transition: color var(--duration-fast);
}

.lp-footer-link:hover {
  color: var(--text-1);
  text-decoration: none;
}
```

- [ ] **Step 6: Visual inspection**

Verify:
- NavRail: labels stagger in with 30ms delay each on hover
- Landing page nav: hamburger visible on mobile, opens dropdown with glass background
- Footer: shows theme switcher + GitHub link, properly spaced

- [ ] **Step 7: Commit**

```bash
git add frontend/src/index.css frontend/src/components/LandingPage.jsx frontend/src/components/LandingPage.css
git commit -m "feat(nav): staggered label reveal, mobile hamburger, themed footer with switcher"
```

---

### Task 7: Responsive Fixes + Loading States

**Goal:** Fix responsive breakpoints, add skeleton loading on landing page form submit, add card tactile feedback, and final polish pass.

**Files:**
- Modify: `frontend/src/components/LandingPage.jsx:339-380` (HeroForm)
- Modify: `frontend/src/components/LandingPage.css` (responsive rules)
- Modify: `frontend/src/index.css` (card tactile feedback)
- Test: Responsive inspection at 375px, 768px, 1024px, 1440px

**Interfaces:**
- Consumes: All previous tasks
- Produces: No API changes — final polish

- [ ] **Step 1: Add loading state to HeroForm**

Open `frontend/src/components/LandingPage.jsx`. Find `HeroForm` (line ~339). Add loading state:

```jsx
const [submitting, setSubmitting] = useState(false);

const handleSubmit = async (e) => {
  e.preventDefault();
  if (!input.trim()) return;
  setSubmitting(true);
  try {
    if (input.includes("github.com")) {
      onAnalyzeUrl(input.trim());
    } else {
      onLoad(input.trim());
    }
  } finally {
    setTimeout(() => setSubmitting(false), 2000);
  }
};
```

Update the button:

```jsx
<button
  type="submit"
  className="lp-hero-btn"
  disabled={submitting}
>
  {submitting ? (
    <>
      <span className="lp-hero-btn-spinner" />
      Analyzing…
    </>
  ) : (
    <>
      Analyze
      <ArrowRight size={14} />
    </>
  )}
</button>
```

- [ ] **Step 2: Add spinner CSS**

In `LandingPage.css`, add after `.lp-hero-btn:hover`:

```css
.lp-hero-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.lp-hero-btn-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 3: Add tactile feedback to dashboard cards**

In `index.css`, find `.card:hover`. Add after it:

```css
.card:active:not(:disabled) {
  transform: scale(0.995);
}
```

Also add to `.finding-card`:

```css
.finding-card:active {
  transform: scale(0.995);
}
```

- [ ] **Step 4: Fix responsive breakpoints for landing page**

In `LandingPage.css`, add missing mobile overrides:

For the stats section:
```css
@media (max-width: 768px) {
  .lp-stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .lp-stat-item:nth-child(2) {
    border-right: none;
  }

  .lp-stat-item:nth-child(1),
  .lp-stat-item:nth-child(2) {
    border-bottom: 1px solid var(--lp-glass-border);
  }

  .lp-stat-value {
    font-size: 32px;
  }
}
```

For the features grid:
```css
@media (max-width: 768px) {
  .lp-features-grid {
    grid-template-columns: 1fr;
  }

  .lp-feature-card--lg,
  .lp-feature-card--sm {
    grid-column: span 1;
  }
}
```

For the how-it-works:
```css
@media (max-width: 768px) {
  .lp-how-steps {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .lp-how-steps::before {
    display: none;
  }
}
```

- [ ] **Step 5: Visual inspection at 4 breakpoints**

Open Chrome DevTools. Test at:
1. **375px (iPhone SE)**: Hamburger visible, hero stacks vertically, stats 2-col, features 1-col
2. **768px (iPad)**: Hamburger visible, hero 2-col if space allows, stats 2-col
3. **1024px (laptop)**: No hamburger, hero 2-col, stats 4-col
4. **1440px (desktop)**: Full layout, max-width 1100px centered

- [ ] **Step 6: Final commit**

```bash
git add frontend/src/components/LandingPage.jsx frontend/src/components/LandingPage.css frontend/src/index.css
git commit -m "feat(polish): loading states, tactile card feedback, responsive breakpoint fixes"
```
