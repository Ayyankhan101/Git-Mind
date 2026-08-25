---
name: color-systems
description: "Build color systems that feel intentional and accessible. This skill covers color theory, palette generation, CSS custom properties, OKLCH color space, WCAG contrast, semantic naming, and design tokens. Use it whenever the user mentions colors, palette, color scheme, brand colors, color tokens, color variables, or color accessibility. Trigger even when the user doesn't say 'color system' but describes color-related needs: 'these colors don't work together', 'make the palette cohesive', 'the brand colors feel off', 'pick better colors'. Also when discussing color contrast, accessible color combinations, or color naming conventions."
---

# Color Systems Skill

## Core Principles

1. **Semantic naming** — Name colors by purpose, not appearance
2. **OKLCH for perceptual uniformity** — Colors that feel equally bright
3. **Accessible by default** — All combinations meet WCAG AA (4.5:1)
4. **Limited palette** — 5-7 core colors, with light/dark/shade variants
5. **CSS custom properties** — All colors as variables for easy theming

## Color Palette Structure

### 12-Color System

```
Primary     — Brand color, CTAs, key actions
Secondary   — Supporting brand color
Accent      — Highlights, links, interactive elements
Neutral     — Text, borders, backgrounds (gray scale)
Success     — Confirmations, positive states
Warning     — Caution, attention needed
Error       — Destructive actions, validation errors
Info        — Neutral information, tips
```

### Each Color Needs

| Variant | Use Case |
|---------|----------|
| 50 | Tinted background (very light) |
| 100 | Light background, subtle highlights |
| 200 | Borders, dividers |
| 300 | Disabled states |
| 400 | Placeholder text |
| 500 | Base color (default state) |
| 600 | Hover state |
| 700 | Active/pressed state |
| 800 | Dark backgrounds |
| 900 | Darkest shade |

## CSS Custom Properties

### Semantic Naming

```css
/* ❌ Appearance-based (fragile) */
.blue-button { background: #3b82f6; }
.light-bg { background: #f8f9fa; }
.dark-text { color: #1a1a2e; }

/* ✅ Semantic-based (robust) */
.button-primary { background: var(--color-primary); }
.surface { background: var(--color-surface); }
.text { color: var(--color-text); }
```

### Complete Token System

```css
:root {
  /* === Core Colors === */
  --color-primary-50: oklch(95% 0.05 260);
  --color-primary-100: oklch(90% 0.08 260);
  --color-primary-200: oklch(80% 0.12 260);
  --color-primary-300: oklch(70% 0.15 260);
  --color-primary-400: oklch(60% 0.18 260);
  --color-primary-500: oklch(50% 0.20 260);  /* Base */
  --color-primary-600: oklch(42% 0.20 260);
  --color-primary-700: oklch(35% 0.18 260);
  --color-primary-800: oklch(28% 0.15 260);
  --color-primary-900: oklch(20% 0.12 260);

  /* === Semantic Tokens === */
  --color-text: var(--color-neutral-900);
  --color-text-secondary: var(--color-neutral-600);
  --color-text-tertiary: var(--color-neutral-400);
  --color-text-inverse: var(--color-neutral-50);

  --color-surface: #ffffff;
  --color-surface-raised: var(--color-neutral-50);
  --color-surface-overlay: rgba(0, 0, 0, 0.5);

  --color-border: var(--color-neutral-200);
  --color-border-strong: var(--color-neutral-400);

  --color-background: #ffffff;
  --color-background-subtle: var(--color-neutral-50);

  /* === Interactive States === */
  --color-primary: var(--color-primary-500);
  --color-primary-hover: var(--color-primary-600);
  --color-primary-active: var(--color-primary-700);
  --color-primary-focus: var(--color-primary-200);

  --color-success: var(--color-green-500);
  --color-warning: var(--color-yellow-500);
  --color-error: var(--color-red-500);
  --color-info: var(--color-blue-500);
}
```

## OKLCH Color Space

### Why OKLCH

| Color Space | Problem |
|-------------|---------|
| Hex/RGB | Not perceptually uniform — same lightness values look different |
| HSL | Hue-dependent lightness — blue looks darker than yellow at same L |
| **OKLCH** | **Perceptually uniform — colors feel equally bright** |

### OKLCH Syntax

```css
/* oklch(L C H) */
/* L = lightness (0-100) */
/* C = chroma/saturation (0-0.4) */
/* H = hue (0-360) */

:root {
  --blue: oklch(65% 0.15 260);
  --green: oklch(70% 0.17 145);
  --red: oklch(65% 0.20 25);
  --yellow: oklch(90% 0.15 85);
}
```

### Generating Palettes

```javascript
// Generate palette from base color
function generatePalette(baseHue) {
  return {
    50:  `oklch(97% 0.02 ${baseHue})`,
    100: `oklch(93% 0.04 ${baseHue})`,
    200: `oklch(85% 0.08 ${baseHue})`,
    300: `oklch(75% 0.12 ${baseHue})`,
    400: `oklch(65% 0.16 ${baseHue})`,
    500: `oklch(55% 0.18 ${baseHue})`,  // Base
    600: `oklch(47% 0.18 ${baseHue})`,
    700: `oklch(40% 0.16 ${baseHue})`,
    800: `oklch(30% 0.12 ${baseHue})`,
    900: `oklch(20% 0.08 ${baseHue})`,
  };
}
```

## WCAG Contrast Requirements

### Minimum Ratios

| Element | Minimum Ratio | Level |
|---------|---------------|-------|
| Normal text (< 18pt) | 4.5:1 | AA |
| Large text (≥ 18pt / 14pt bold) | 3:1 | AA |
| UI components & icons | 3:1 | AA |
| Focus indicators | 3:1 | AA |
| Normal text | 7:1 | AAA |
| Large text | 4.5:1 | AAA |

### Contrast Checking

```javascript
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

// Verify your palette
getContrastRatio('#ffffff', '#1a1a2e'); // → 15.4:1 ✅ AAA
getContrastRatio('#ffffff', '#6b7280'); // → 5.0:1 ✅ AA
getContrastRatio('#ffffff', '#9ca3af'); // → 2.9:1 ❌ Fail
```

### Safe Color Combinations

```css
/* ✅ Always safe */
--text-on-white: oklch(20% 0.01 260);    /* Dark gray on white */
--text-on-dark: oklch(95% 0.01 260);     /* Light gray on dark */
--primary-on-white: oklch(50% 0.18 260); /* Saturated blue on white */

/* ⚠️ Needs checking */
--yellow-on-white: oklch(80% 0.15 85);   /* Yellow — low contrast on white */
--light-blue-on-white: oklch(75% 0.10 260); /* Light blue — may fail */
```

## Color for UI States

```css
/* Interactive elements */
.button {
  background: var(--color-primary);
  color: var(--color-text-inverse);
}

.button:hover {
  background: var(--color-primary-hover);
}

.button:active {
  background: var(--color-primary-active);
}

.button:focus-visible {
  outline: 2px solid var(--color-primary-focus);
  outline-offset: 2px;
}

.button:disabled {
  background: var(--color-neutral-200);
  color: var(--color-neutral-400);
  cursor: not-allowed;
}

/* Form states */
.input { border-color: var(--color-border); }
.input:focus { border-color: var(--color-primary); }
.input.error { border-color: var(--color-error); }
.input.success { border-color: var(--color-success); }
```

## Color in Dark Mode

```css
:root {
  --color-surface: #ffffff;
  --color-surface-raised: oklch(97% 0.005 260);
  --color-text: oklch(20% 0.01 260);
  --color-text-secondary: oklch(45% 0.01 260);
}

[data-theme="dark"] {
  --color-surface: oklch(15% 0.01 260);
  --color-surface-raised: oklch(20% 0.01 260);
  --color-text: oklch(93% 0.01 260);
  --color-text-secondary: oklch(70% 0.01 260);

  /* Shift primary slightly lighter for contrast */
  --color-primary: oklch(70% 0.18 260);
}
```

## Common Anti-Patterns

1. **Hardcoded hex values** — Using `#3b82f6` instead of `var(--color-primary)`
2. **Appearance-based names** — `.blue-bg`, `.light-text` instead of semantic names
3. **Too many colors** — 15+ unique colors create visual noise
4. **No contrast checking** — Light text on light backgrounds
5. **Inconsistent naming** — `--brand-blue` vs `--primary` vs `--accent-color`
6. **Missing states** — No hover/active/disabled/focus variants
7. **RGB/HSL for palettes** — Not perceptually uniform
8. **No dark mode tokens** — Hardcoding light-mode-only colors

## Framework Notes

### Tailwind CSS

```html
<!-- Use Tailwind's color system -->
<button class="bg-blue-500 hover:bg-blue-600 active:bg-blue-700">
<p class="text-gray-900 dark:text-gray-100">
<div class="border-gray-200 dark:border-gray-700">

<!-- Custom colors in tailwind.config.js -->
<!-- colors: { primary: { 50: 'oklch(95% 0.05 260)', ... } } -->
```

### CSS-in-JS (Styled Components / Emotion)

```javascript
// Theme object
const theme = {
  colors: {
    primary: {
      50: 'oklch(95% 0.05 260)',
      500: 'oklch(50% 0.20 260)',
      600: 'oklch(42% 0.20 260)',
    },
    text: {
      primary: 'oklch(20% 0.01 260)',
      secondary: 'oklch(45% 0.01 260)',
    },
  },
};
```

### Design Tokens (JSON)

```json
{
  "color": {
    "primary": {
      "50": { "value": "oklch(95% 0.05 260)" },
      "500": { "value": "oklch(50% 0.20 260)" },
      "600": { "value": "oklch(42% 0.20 260)" }
    },
    "text": {
      "primary": { "value": "oklch(20% 0.01 260)" },
      "secondary": { "value": "oklch(45% 0.01 260)" }
    }
  }
}
```

## Learning Protocol

This skill participates in the shared learning system. After each use, outcomes are logged and patterns are extracted to improve future responses.

**See:** `shared/LEARNING-PROTOCOL.md` for the full protocol.
**Patterns:** `shared/PATTERNS-LIBRARY.json` for accumulated knowledge.
**Feedback:** `shared/FEEDBACK-LOG.json` for usage tracking.
