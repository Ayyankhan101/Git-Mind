---
name: accessibility
description: "Build interfaces that work for everyone. This skill covers WCAG 2.1 compliance, semantic HTML, ARIA attributes, keyboard navigation, screen reader support, focus management, color contrast, and reduced motion. Use it whenever the user mentions accessibility, a11y, WCAG, screen reader, keyboard navigation, ARIA, focus management, or inclusive design. Trigger even when the user doesn't say 'accessibility' but describes a11y-related needs: 'make this usable for everyone', 'screen readers can't read this', 'keyboard navigation is broken', 'users with disabilities'. Also when discussing color contrast for accessibility, prefers-reduced-motion, or accessible forms."
---

# Accessibility Skill

## Core Principles

1. **Semantic first** — Use HTML elements for their meaning, not appearance
2. **Keyboard accessible** — Everything reachable and operable without a mouse
3. **Screen reader friendly** — Content announced correctly, no orphaned elements
4. **Visible focus** — Clear focus indicators on all interactive elements
5. **Don't break accessibility** — Never remove outlines without replacement

## Semantic HTML

### Use Elements for Their Meaning

```html
<!-- ❌ Div soup -->
<div class="nav">
  <div class="nav-item"><div class="link">Home</div></div>
  <div class="nav-item"><div class="link">About</div></div>
</div>

<div class="card">
  <div class="card-title">Title</div>
  <div class="card-body">Content</div>
  <div class="button">Read more</div>
</div>

<!-- ✅ Semantic HTML -->
<nav aria-label="Main navigation">
  <ul>
    <li><a href="/">Home</a></li>
    <li><a href="/about">About</a></li>
  </ul>
</nav>

<article class="card">
  <h2 class="card-title">Title</h2>
  <p class="card-body">Content</p>
  <a href="/more" class="button">Read more</a>
</article>
```

### Landmark Regions

```html
<body>
  <header>
    <nav aria-label="Main">...</nav>
  </header>
  <main>
    <article>
      <h1>Page Title</h1>
      <section aria-labelledby="section-1">
        <h2 id="section-1">Section Title</h2>
        <p>Content</p>
      </section>
    </article>
    <aside aria-label="Related">...</aside>
  </main>
  <footer>...</footer>
</body>
```

## ARIA Attributes

### When to Use ARIA

| Situation | ARIA | Why |
|-----------|------|-----|
| Custom interactive element | `role`, `aria-label` | No native semantics |
| Live content updates | `aria-live` | Announce changes |
| Expanded/collapsed | `aria-expanded` | State communication |
| Selected state | `aria-selected` | Tab/list selection |
| Invalid form field | `aria-invalid` | Error state |

### When NOT to Use ARIA

```html
<!-- ❌ Don't add role to native elements -->
<button role="button">Click</button>   <!-- button already has role -->
<a href="/" role="link">Home</a>       <!-- a already has role -->

<!-- ❌ Don't use aria-label on visible text -->
<span aria-label="Close">Close</span>

<!-- ❌ Don't use aria-hidden on focusable elements -->
<button aria-hidden="true">Click</button>
```

### Common ARIA Patterns

```html
<!-- Dropdown menu -->
<button aria-expanded="false" aria-haspopup="true" aria-controls="menu-1">
  Options
</button>
<ul id="menu-1" role="menu" hidden>
  <li role="menuitem"><button>Edit</button></li>
  <li role="menuitem"><button>Delete</button></li>
</ul>

<!-- Tab panel -->
<div role="tablist" aria-label="Settings">
  <button role="tab" aria-selected="true" aria-controls="panel-1" id="tab-1">
    General
  </button>
  <button role="tab" aria-selected="false" aria-controls="panel-2" id="tab-2" tabindex="-1">
    Advanced
  </button>
</div>
<div role="tabpanel" id="panel-1" aria-labelledby="tab-1">
  <p>General settings content</p>
</div>

<!-- Alert -->
<div role="alert" aria-live="assertive">
  Form submitted successfully!
</div>

<!-- Progress -->
<div role="progressbar" aria-valuenow="50" aria-valuemin="0" aria-valuemax="100"
     aria-label="Upload progress">
  50%
</div>
```

## Keyboard Navigation

### Focus Management

```css
/* ✅ Always visible focus indicator */
:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

/* ❌ Never do this */
*:focus { outline: none; }

/* ✅ Custom focus that's always visible */
:focus-visible {
  outline: 3px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: 2px;
}
```

### Keyboard Shortcuts

```javascript
// Escape closes modals/dropdowns
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    // Return focus to trigger element
    triggerElement.focus();
  }
});

// Arrow keys navigate within lists
list.addEventListener('keydown', (e) => {
  const items = Array.from(list.querySelectorAll('[role="menuitem"]'));
  const currentIndex = items.indexOf(document.activeElement);

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      items[(currentIndex + 1) % items.length].focus();
      break;
    case 'ArrowUp':
      e.preventDefault();
      items[(currentIndex - 1 + items.length) % items.length].focus();
      break;
    case 'Home':
      e.preventDefault();
      items[0].focus();
      break;
    case 'End':
      e.preventDefault();
      items[items.length - 1].focus();
      break;
  }
});
```

### Focus Trap (Modals)

```javascript
function trapFocus(modal) {
  const focusable = modal.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  first.focus();
}
```

## Screen Readers

### Hidden Content

```html
<!-- ✅ Visually hidden but announced by screen readers -->
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

<!-- Use cases -->
<span class="sr-only">Skip to main content</span>
<span class="sr-only">Current page: Home</span>
<span class="sr-only">Loading...</span>
```

### Live Regions

```html
<!-- Polite: wait for user to finish -->
<div aria-live="polite" aria-atomic="true">
  3 items in cart
</div>

<!-- Assertive: interrupt immediately -->
<div aria-live="assertive" role="alert">
  Error: Payment failed
</div>

<!-- Status updates -->
<div role="status" aria-live="polite">
  Page 2 of 10
</div>
```

### Image Alternatives

```html
<!-- Informative image: describe content -->
<img src="chart.png" alt="Sales increased 45% from January to March 2024" />

<!-- Decorative image: empty alt -->
<img src="decorative.svg" alt="" role="presentation" />

<!-- Complex image: use figcaption -->
<figure>
  <img src="architecture.png" alt="System architecture diagram" />
  <figcaption>
    The system uses a three-tier architecture with load balancer,
    API servers, and database cluster.
  </figcaption>
</figure>
```

## Forms

### Labels and Instructions

```html
<!-- ✅ Every input needs a label -->
<label for="email">Email address</label>
<input id="email" type="email" required aria-required="true" />

<!-- ✅ Required fields marked visually AND for screen readers -->
<label for="name">
  Name <span aria-hidden="true">*</span>
  <span class="sr-only">(required)</span>
</label>
<input id="name" required aria-required="true" />

<!-- ✅ Help text linked via aria-describedby -->
<label for="password">Password</label>
<input id="password" type="password" aria-describedby="password-hint" />
<span id="password-hint">Must be at least 8 characters</span>
```

### Error Handling

```html
<label for="email">Email</label>
<input
  id="email"
  type="email"
  aria-invalid="true"
  aria-describedby="email-error"
  aria-required="true"
/>
<span id="email-error" role="alert" class="error">
  Please enter a valid email address
</span>
```

## Color and Contrast

### WCAG Requirements

| Element | Minimum Ratio | Level |
|---------|---------------|-------|
| Normal text (< 18pt) | 4.5:1 | AA |
| Large text (≥ 18pt / 14pt bold) | 3:1 | AA |
| UI components | 3:1 | AA |
| Focus indicators | 3:1 | AA |

### Don't Rely on Color Alone

```html
<!-- ❌ Color-only indication -->
<span style="color: red">Required</span>
<span style="color: green">✓</span>

<!-- ✅ Color + text/icon -->
<span style="color: red" aria-hidden="true">*</span>
<span class="sr-only">Required</span>

<span style="color: green">✓ <span class="sr-only">Valid</span></span>
```

```css
/* ❌ Color-only error */
.input.error { border-color: red; }

/* ✅ Color + icon + text */
.input.error {
  border-color: var(--color-error);
}
.input.error::after {
  content: "⚠";
  position: absolute;
  right: 0.75rem;
}
```

## Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

```javascript
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

if (prefersReducedMotion.matches) {
  // Disable animations
  gsap.globalTimeline.timeScale(0);
} else {
  // Enable animations
  gsap.globalTimeline.timeScale(1);
}
```

## Common Anti-Patterns

1. **`outline: none`** — Removing focus indicators without replacement
2. **Div soup** — Using `<div>` for buttons, links, navigation
3. **No labels** — Inputs without associated `<label>` elements
4. **Missing alt text** — Images without `alt` attributes
5. **Keyboard traps** — Users can't tab out of components
6. **Color-only status** — Using only color to convey information
7. **No skip links** — Users must tab through entire nav to reach content
8. **Autoplay without pause** — No way to stop animations or videos
9. **Missing ARIA** — Custom widgets without proper roles/states
10. **Z-index wars** — Modals that can't receive focus

## Testing Checklist

- [ ] All interactive elements reachable via Tab
- [ ] Focus indicator visible on every focusable element
- [ ] All images have appropriate `alt` text
- [ ] All form inputs have associated labels
- [ ] Color contrast meets WCAG AA (4.5:1)
- [ ] No content relies solely on color
- [ ] Modals trap focus correctly
- [ ] Escape key closes overlays
- [ ] Screen reader announces live region updates
- [ ] `prefers-reduced-motion` respected
- [ ] Skip link present and functional
- [ ] Language attribute set on `<html>`

## Learning Protocol

This skill participates in the shared learning system. After each use, outcomes are logged and patterns are extracted to improve future responses.

**See:** `shared/LEARNING-PROTOCOL.md` for the full protocol.
**Patterns:** `shared/PATTERNS-LIBRARY.json` for accumulated knowledge.
**Feedback:** `shared/FEEDBACK-LOG.json` for usage tracking.
