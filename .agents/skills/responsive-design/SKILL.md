---
name: responsive-design
description: "Build responsive layouts that work on every screen size. This skill covers mobile-first CSS, fluid typography, container queries, modern breakpoint strategies, touch-friendly targets, and responsive patterns (stack, sidebar, multi-column). Use it whenever the user mentions responsive, mobile, tablet, desktop, screen sizes, breakpoints, viewport, or adapting layout to different devices. Trigger even when the user doesn't say 'responsive' but describes layouts that need to work across sizes: 'make it work on phones', 'this looks broken on mobile', 'adjust for smaller screens'. Also when discussing responsive images, responsive navigation patterns (hamburger menus, drawer nav), or responsive tables."
---

# Responsive Design Skill

## Core Principles

1. **Mobile-first** — Start with the smallest screen, add complexity upward
2. **Content-first** — Let content dictate breakpoints, not devices
3. **Fluid over fixed** — Use `clamp()`, `min()`, `max()` for smooth transitions
4. **Touch-first** — Minimum 44×44px touch targets, generous padding
5. **Progressive enhancement** — Core content accessible everywhere, enhanced on larger screens

## Breakpoint Strategy

Use content-driven breakpoints, not device-driven:

```css
/* ❌ Device-driven (fragile) */
@media (min-width: 768px) { /* iPad */ }
@media (min-width: 1024px) { /* Desktop */ }

/* ✅ Content-driven (robust) */
@media (min-width: 40em) { /* Content needs more space */ }
@media (min-width: 64em) { /* Layout can go multi-column */ }
@media (min-width: 80em) { /* Full desktop treatment */ }
```

### Recommended Breakpoints

```css
:root {
  --bp-sm: 40em;    /* 640px - Small tablets, large phones landscape */
  --bp-md: 64em;    /* 1024px - Tablets, small laptops */
  --bp-lg: 80em;    /* 1280px - Desktops */
  --bp-xl: 100em;   /* 1600px - Large screens */
}
```

### When to Use Container Queries vs Media Queries

| Use Case | Tool | Why |
|----------|------|-----|
| Page-level layout | Media query | Responds to viewport |
| Card/component layout | Container query | Responds to parent |
| Sidebar visibility | Media query | Viewport-dependent |
| Card grid columns | Container query | Works in any context |

```css
/* Container query for component-level responsiveness */
.card-container {
  container-type: inline-size;
}

@container (min-width: 400px) {
  .card {
    display: grid;
    grid-template-columns: 200px 1fr;
  }
}
```

## Fluid Typography

Use `clamp()` for smooth font scaling:

```css
/* ❌ Fixed sizes with media queries */
h1 { font-size: 2rem; }
@media (min-width: 768px) { h1 { font-size: 3rem; } }
@media (min-width: 1024px) { h1 { font-size: 4rem; } }

/* ✅ Fluid typography */
h1 {
  font-size: clamp(2rem, 5vw + 1rem, 4rem);
}

/* ✅ Fluid spacing */
.section {
  padding: clamp(1.5rem, 5vw, 6rem) clamp(1rem, 3vw, 4rem);
}
```

### Fluid Type Scale

```css
:root {
  --text-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);
  --text-sm: clamp(0.875rem, 0.8rem + 0.375vw, 1rem);
  --text-base: clamp(1rem, 0.9rem + 0.5vw, 1.125rem);
  --text-lg: clamp(1.125rem, 1rem + 0.625vw, 1.25rem);
  --text-xl: clamp(1.25rem, 1rem + 1.25vw, 1.5rem);
  --text-2xl: clamp(1.5rem, 1rem + 2.5vw, 2.25rem);
  --text-3xl: clamp(1.875rem, 1rem + 4.375vw, 3rem);
  --text-4xl: clamp(2.25rem, 1rem + 6.25vw, 3.75rem);
}
```

## Layout Patterns

### Stack → Grid (Most Common)

```css
/* Mobile: single column stack */
.grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Tablet+: auto-fit grid */
@media (min-width: 40em) {
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
    gap: 1.5rem;
  }
}
```

### Sidebar Layout

```css
/* Mobile: stacked */
.layout {
  display: flex;
  flex-direction: column;
}

/* Desktop: sidebar + content */
@media (min-width: 64em) {
  .layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 2rem;
  }
}
```

### Intrinsic Design (No Breakpoints)

```css
/* Let the browser decide */
.auto-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
  gap: 1rem;
}
```

## Responsive Navigation

### Mobile: Hamburger + Drawer

```css
/* Mobile: hamburger menu */
.nav-links {
  display: none;
  position: fixed;
  inset: 0;
  background: var(--bg);
  flex-direction: column;
  padding: 5rem 2rem 2rem;
}

.nav-links[data-open="true"] {
  display: flex;
}

/* Desktop: inline links */
@media (min-width: 64em) {
  .nav-toggle { display: none; }
  .nav-links {
    display: flex;
    position: static;
    flex-direction: row;
    padding: 0;
    background: none;
  }
}
```

### Avoid: Responsive Table Anti-Patterns

```css
/* ❌ Horizontal scroll (users miss content) */
.table-wrapper { overflow-x: auto; }

/* ✅ Responsive table patterns */
@media (max-width: 40em) {
  table, thead, tbody, th, td, tr {
    display: block;
  }
  thead { display: none; }
  td {
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--border);
  }
  td::before {
    content: attr(data-label);
    font-weight: 600;
    display: block;
    margin-bottom: 0.25rem;
  }
}
```

## Touch Targets

```css
/* Minimum 44×44px touch targets */
.button, .link, [role="button"] {
  min-height: 44px;
  min-width: 44px;
  padding: 0.75rem 1.5rem;
}

/* Increase tap area without changing visual size */
.nav-link {
  padding: 0.75rem 1rem;
  position: relative;
}

/* Visible focus for keyboard navigation */
:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
```

## Responsive Images

```html
<!-- Art-directed images -->
<picture>
  <source media="(min-width: 800px)" srcset="hero-wide.webp" />
  <source media="(min-width: 400px)" srcset="hero-medium.webp" />
  <img src="hero-narrow.webp" alt="..." loading="lazy" />
</picture>

<!-- Responsive width with max -->
<img src="photo.webp" alt="..." style="width: min(100%, 600px);" />
```

## Common Anti-Patterns

1. **Desktop-first** — Writing media queries for max-width instead of min-width
2. **Device-specific breakpoints** — Targeting iPhone, iPad by name instead of content
3. **Hidden content** — `display: none` removes content from accessibility tree
4. **Tiny touch targets** — Links/buttons under 44×44px on mobile
5. **Fixed widths** — `width: 1200px` instead of `max-width: 1200px` or `min(100%, 1200px)`
6. **Zoom blocking** — `<meta name="viewport" content="maximum-scale=1">` prevents user zoom
7. **Responsive text via media queries** — Use `clamp()` instead for smooth scaling
8. **Overriding user preferences** — `touch-action: manipulation` disables double-tap zoom

## Framework Notes

### React / Next.js

```jsx
// Use CSS modules or Tailwind, not inline styles for responsive
// ✅ Tailwind
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

// ✅ CSS Modules
<div className={styles.grid}>
```

### Svelte

```svelte
<!-- Use media queries in <style> -->
<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr;
  }
  @media (min-width: 64em) {
    .grid { grid-template-columns: repeat(3, 1fr); }
  }
</style>
```

### Tailwind CSS

```html
<!-- Mobile-first is built in -->
<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
  <!-- Fluid typography -->
  <h1 class="text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
  <!-- Fluid spacing -->
  <section class="px-4 sm:px-6 md:px-8 lg:px-12 py-8 md:py-12 lg:py-16">
```

## Learning Protocol

This skill participates in the shared learning system. After each use, outcomes are logged and patterns are extracted to improve future responses.

**See:** `shared/LEARNING-PROTOCOL.md` for the full protocol.
**Patterns:** `shared/PATTERNS-LIBRARY.json` for accumulated knowledge.
**Feedback:** `shared/FEEDBACK-LOG.json` for usage tracking.
