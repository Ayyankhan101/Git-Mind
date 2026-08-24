---
name: dark-mode
description: "Implement dark mode that respects user preferences and feels native. This skill covers system preference detection, CSS custom properties for theming, smooth theme transitions, component-specific color choices, and accessibility (WCAG contrast). Use it whenever the user mentions dark mode, dark theme, light theme, theme switching, color scheme, appearance toggle, or prefers-color-scheme. Trigger even when the user doesn't say 'dark mode' but describes theming needs: 'make it look good at night', 'add a theme toggle', 'support both light and dark'. Also when discussing high contrast, color accessibility, or system preference detection."
---

# Dark Mode Skill

## Core Principles

1. **Respect system first** — Default to `prefers-color-scheme`, offer manual toggle as override
2. **CSS custom properties** — All colors defined as variables, swapped per theme
3. **No flash of wrong theme** — Inline script in `<head>` to prevent FOUC
4. **Smooth transitions** — Animate color changes, not instant swaps
5. **WCAG AA minimum** — 4.5:1 contrast for text, 3:1 for large text and UI components

## Theme Detection

### System Preference (Default)

```css
/* Light mode (default) */
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f8f9fa;
  --text-primary: #1a1a2e;
  --text-secondary: #4a4a6a;
  --border: #e2e8f0;
  --accent: #3b82f6;
}

/* Dark mode via system preference */
@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #0f0f1a;
    --bg-secondary: #1a1a2e;
    --text-primary: #e2e8f0;
    --text-secondary: #94a3b8;
    --border: #2d2d44;
    --accent: #60a5fa;
  }
}
```

### Manual Toggle with localStorage

```css
/* Data attribute override */
[data-theme="dark"] {
  --bg-primary: #0f0f1a;
  --bg-secondary: #1a1a2e;
  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --border: #2d2d44;
  --accent: #60a5fa;
}

[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f8f9fa;
  --text-primary: #1a1a2e;
  --text-secondary: #4a4a6a;
  --border: #e2e8f0;
  --accent: #3b82f6;
}
```

```javascript
// Theme toggle logic
function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }
  // Falls back to prefers-color-scheme via CSS
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const next = current === 'dark' ? 'light' : current === 'light' ? 'dark' : (prefersDark ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}
```

### Prevent Flash of Wrong Theme (FOUC)

```html
<!-- Inline in <head>, before any CSS -->
<script>
  (function() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && prefersDark)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  })();
</script>
```

## Smooth Theme Transitions

```css
/* Transition all color properties */
*, *::before, *::after {
  transition: background-color 0.3s ease,
              color 0.3s ease,
              border-color 0.3s ease,
              box-shadow 0.3s ease;
}

/* Don't transition on page load */
.no-transition * {
  transition: none !important;
}
```

```javascript
// Add class to prevent transition on initial load
document.documentElement.classList.add('no-transition');
requestAnimationFrame(() => {
  document.documentElement.classList.remove('no-transition');
});
```

## Component-Specific Colors

### Buttons

```css
.button-primary {
  background: var(--accent);
  color: #ffffff;
  border: none;
}

/* Dark mode: slightly lighter accent for contrast */
[data-theme="dark"] .button-primary {
  background: var(--accent);
  /* Ensure 4.5:1 contrast against dark backgrounds */
}

.button-secondary {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border);
}
```

### Cards

```css
.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* Dark mode: reduce shadow, increase border */
[data-theme="dark"] .card {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  border-color: var(--border);
}
```

### Code Blocks

```css
/* Light mode: GitHub-style */
pre {
  background: #f6f8fa;
  color: #24292e;
}

/* Dark mode: One Dark-style */
[data-theme="dark"] pre {
  background: #1e1e2e;
  color: #cdd6f4;
}
```

### Images & Media

```css
/* Dark mode: softer images */
[data-theme="dark"] img {
  opacity: 0.9;
}

/* Dark mode: adjust SVG fills */
[data-theme="dark"] .icon {
  filter: invert(1) hue-rotate(180deg);
}
```

## Color Palette Strategy

### Use OKLCH for Perceptual Uniformity

```css
:root {
  /* Light mode — OKLCH for perceptually uniform colors */
  --gray-50: oklch(98% 0.005 260);
  --gray-100: oklch(96% 0.005 260);
  --gray-200: oklch(92% 0.005 260);
  --gray-800: oklch(25% 0.005 260);
  --gray-900: oklch(18% 0.005 260);

  --blue-500: oklch(65% 0.15 260);
  --blue-600: oklch(55% 0.15 260);
}

[data-theme="dark"] {
  --gray-50: oklch(18% 0.005 260);
  --gray-100: oklch(22% 0.005 260);
  --gray-200: oklch(28% 0.005 260);
  --gray-800: oklch(90% 0.005 260);
  --gray-900: oklch(96% 0.005 260);

  --blue-500: oklch(70% 0.15 260);
  --blue-600: oklch(60% 0.15 260);
}
```

### Contrast Checking

```javascript
// Quick contrast ratio check
function getContrastRatio(hex1, hex2) {
  const luminance = (hex) => {
    const rgb = hex.replace('#', '').match(/.{2}/g).map(x => {
      const v = parseInt(x, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// WCAG AA: 4.5:1 for normal text, 3:1 for large text
getContrastRatio('#1a1a2e', '#e2e8f0'); // → 12.5:1 ✅
```

## Accessibility

### WCAG Contrast Requirements

| Element | Minimum Ratio | Target |
|---------|---------------|--------|
| Normal text (< 18pt) | 4.5:1 | AA |
| Large text (≥ 18pt / 14pt bold) | 3:1 | AA |
| UI components & icons | 3:1 | AA |
| Focus indicators | 3:1 | AA |

### Don't Rely on Color Alone

```css
/* ❌ Color-only status */
.error { color: #ef4444; }
.success { color: #22c55e; }

/* ✅ Color + icon/pattern */
.error { color: #ef4444; }
.error::before { content: "⚠ "; }
.success { color: #22c55e; }
.success::before { content: "✓ "; }
```

### Respect Reduced Motion

```css
/* Don't animate theme toggle for users who prefer reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition: none !important;
  }
}
```

## Common Anti-Patterns

1. **Hardcoded colors** — Using `#fff` or `#000` instead of variables
2. **No system preference** — Forcing light or dark without detecting preference
3. **FOUC** — Flash of wrong theme on page load (fix with inline `<head>` script)
4. **Jarring switch** — No transition between themes
5. **Low contrast in dark mode** — Gray text on dark backgrounds (< 4.5:1)
6. **Ignoring `prefers-contrast`** — Some users need high contrast mode
7. **Overly saturated colors** — Neon colors on dark backgrounds cause eye strain
8. **No toggle** — Forcing users to use system preference only

## Framework Notes

### React / Next.js

```jsx
// Theme context
const ThemeContext = createContext();

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') || 'system';
    }
    return 'system';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

### Svelte

```svelte
<script>
  import { writable } from 'svelte/store';

  const theme = writable('system');

  function toggle() {
    theme.update(t => t === 'dark' ? 'light' : 'dark');
  }

  $: if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', $theme);
  }
</script>

<button on:click={toggle}>
  {$theme === 'dark' ? '☀️' : '🌙'}
</button>
```

### Tailwind CSS

```html
<!-- Use Tailwind's dark mode with data attribute strategy -->
<html data-theme="dark">

<!-- In tailwind.config.js: -->
<!-- darkMode: ['selector', '[data-theme="dark"]'] -->

<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  <h1 class="text-gray-800 dark:text-gray-200">
  <button class="bg-blue-500 dark:bg-blue-400">
```

## Learning Protocol

This skill participates in the shared learning system. After each use, outcomes are logged and patterns are extracted to improve future responses.

**See:** `shared/LEARNING-PROTOCOL.md` for the full protocol.
**Patterns:** `shared/PATTERNS-LIBRARY.json` for accumulated knowledge.
**Feedback:** `shared/FEEDBACK-LOG.json` for usage tracking.
