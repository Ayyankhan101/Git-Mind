---
name: typography
description: "Build typography that feels intentional and premium. This skill covers type scales, line height, measure (line length), visual hierarchy, font loading strategies, variable fonts, and responsive type. Use it whenever the user mentions typography, fonts, text styling, type scale, line height, font pairing, heading hierarchy, or readable text. Trigger even when the user doesn't say 'typography' but describes text-related needs: 'the text looks cramped', 'make the headings stand out', 'this block of text is hard to read', 'choose better fonts'. Also when discussing web fonts, font loading performance, or font-display strategies."
---

# Typography Skill

## Core Principles

1. **Hierarchy first** — Size, weight, and spacing create clear reading order
2. **Measure matters** — Line length of 45-75 characters for body text
3. **Vertical rhythm** — Consistent spacing based on a baseline grid
4. **Font loading** — No invisible text during font load (FOIT/FOUT)
5. **Less is more** — Maximum 2 font families, 3-4 weights

## Type Scale

Use a modular scale for harmonious sizing:

```css
/* ❌ Random sizes */
h1 { font-size: 48px; }
h2 { font-size: 32px; }
h3 { font-size: 24px; }
p { font-size: 16px; }

/* ✅ Modular scale (ratio: 1.25) */
:root {
  --text-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);    /* 12-14px */
  --text-sm: clamp(0.875rem, 0.8rem + 0.375vw, 1rem);       /* 14-16px */
  --text-base: clamp(1rem, 0.9rem + 0.5vw, 1.125rem);       /* 16-18px */
  --text-lg: clamp(1.125rem, 1rem + 0.625vw, 1.25rem);      /* 18-20px */
  --text-xl: clamp(1.25rem, 1rem + 1.25vw, 1.5rem);         /* 20-24px */
  --text-2xl: clamp(1.5rem, 1rem + 2.5vw, 2.25rem);         /* 24-36px */
  --text-3xl: clamp(1.875rem, 1rem + 4.375vw, 3rem);        /* 30-48px */
  --text-4xl: clamp(2.25rem, 1rem + 6.25vw, 3.75rem);       /* 36-60px */
}
```

### Common Scale Ratios

| Ratio | Name | Feel |
|-------|------|------|
| 1.125 | Major Second | Subtle, compact |
| 1.250 | Major Third | Balanced, versatile |
| 1.333 | Perfect Fourth | Classic, editorial |
| 1.414 | Augmented Fourth | Dramatic, modern |
| 1.500 | Perfect Fifth | Bold, cinematic |
| 1.618 | Golden Ratio | Natural, harmonious |

## Line Height (Leading)

```css
/* ❌ Too tight */
p { line-height: 1.2; }  /* Cramped for body text */

/* ❌ Too loose */
p { line-height: 2.0; }  /* Lines disconnect */

/* ✅ Sweet spots */
body { line-height: 1.6; }           /* Body text */
h1, h2, h3 { line-height: 1.1; }    /* Headings (tighter) */
small { line-height: 1.4; }          /* Captions, small text */
pre, code { line-height: 1.5; }      /* Code blocks */

/* ✅ Fluid line height */
h1 {
  line-height: clamp(1.1, 1.0 + 0.5vw, 1.2);
}
```

### Line Height Rules

| Context | Line Height | Why |
|---------|-------------|-----|
| Body text | 1.5 - 1.7 | Readability |
| Headings | 1.0 - 1.2 | Compact, impactful |
| Small text | 1.3 - 1.5 | Compensates for size |
| Code blocks | 1.4 - 1.6 | Clear line separation |
| Lists | 1.5 - 1.6 | Match body text |

## Measure (Line Length)

```css
/* ❌ Too wide — eyes get lost */
p { max-width: none; }

/* ❌ Too narrow — too many line breaks */
p { max-width: 30ch; }

/* ✅ Optimal: 45-75 characters */
p {
  max-width: 65ch;  /* Ideal for body text */
}

/* ✅ Different measures for context */
.lead { max-width: 55ch; }    /* Intro text: slightly shorter */
.body { max-width: 65ch; }    /* Body: standard */
.caption { max-width: 40ch; } /* Captions: short */
```

## Vertical Rhythm

```css
/* Base unit: 4px or 8px grid */
:root {
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.5rem;    /* 24px */
  --space-6: 2rem;      /* 32px */
  --space-8: 3rem;      /* 48px */
  --space-10: 4rem;     /* 64px */
}

/* Apply consistent spacing */
p + p { margin-top: var(--space-4); }
h1 { margin-bottom: var(--space-4); }
h2 { margin-top: var(--space-8); margin-bottom: var(--space-4); }
h3 { margin-top: var(--space-6); margin-bottom: var(--space-3); }
```

## Visual Hierarchy

```css
/* ✅ Clear hierarchy through size, weight, and color */
h1 {
  font-size: var(--text-4xl);
  font-weight: 800;
  letter-spacing: -0.025em;
  color: var(--text-primary);
}

h2 {
  font-size: var(--text-3xl);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

h3 {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--text-primary);
}

p, li {
  font-size: var(--text-base);
  font-weight: 400;
  color: var(--text-secondary);
}

small, .caption {
  font-size: var(--text-sm);
  font-weight: 400;
  color: var(--text-tertiary);
}
```

## Font Loading

### Font Display Strategy

```css
/* ✅ Use font-display: swap to prevent FOIT */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-var.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: swap;  /* Show fallback, swap when loaded */
}
```

| Value | Behavior | Use When |
|-------|----------|----------|
| `swap` | Show fallback immediately, swap when loaded | Body text, headings |
| `optional` | Use only if loaded quickly | Decorative text |
| `fallback` | Brief block, then fallback | Short animations |
| `block` | Block text until loaded | Avoid for body text |

### Preload Critical Fonts

```html
<link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin />
```

### Variable Fonts (Preferred)

```css
/* ✅ One file, all weights */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-var.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-style: normal;
}

body { font-weight: 400; }
strong { font-weight: 600; }
h1 { font-weight: 800; }
```

## Font Pairing

### Rules

1. **Maximum 2 families** — One for headings, one for body (or same for both)
2. **Contrast, not clash** — Serif + sans-serif, or same family different weights
3. **Same x-height** — Pair fonts with similar proportions

### Proven Pairings

| Headings | Body | Vibe |
|----------|------|------|
| Inter | Inter | Clean, modern |
| Playfair Display | Inter | Editorial, elegant |
| Space Grotesk | Inter | Tech, geometric |
| Fraunces | Inter | Warm, friendly |
| JetBrains Mono | Inter | Developer, technical |

```css
/* ✅ Simple: one family, multiple weights */
body { font-family: 'Inter', sans-serif; font-weight: 400; }
h1 { font-family: 'Inter', sans-serif; font-weight: 800; }

/* ✅ Pairing: serif headings + sans body */
h1 { font-family: 'Playfair Display', serif; font-weight: 700; }
body { font-family: 'Inter', sans-serif; font-weight: 400; }
```

## Letter Spacing

```css
/* ✅ Tighten large text, loosen small text */
h1 { letter-spacing: -0.025em; }  /* Large: slightly tighter */
h2 { letter-spacing: -0.02em; }
body { letter-spacing: 0; }        /* Normal: default */
small { letter-spacing: 0.025em; } /* Small: slightly wider */
.caption { letter-spacing: 0.05em; }
.label { letter-spacing: 0.1em; text-transform: uppercase; }
```

## Common Anti-Patterns

1. **Too many fonts** — 3+ font families create visual chaos
2. **Inconsistent scale** — Random pixel values instead of modular scale
3. **Poor measure** — Body text wider than 75ch or narrower than 45ch
4. **No hierarchy** — All text looks the same size/weight
5. **FOIT** — `font-display: block` causes invisible text
6. **Tight line height on body** — `line-height: 1.2` on paragraphs
7. **Loose line height on headings** — `line-height: 1.8` on h1
8. **Wrong letter spacing** — Normal spacing on large text, tight on small text
9. **Pixel units** — Using `px` for type instead of `rem`/`em`
10. **No font fallbacks** — Missing system font stack

## Framework Notes

### CSS Custom Properties (Recommended)

```css
:root {
  /* Type scale */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-serif: 'Playfair Display', Georgia, serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Sizes */
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

### Tailwind CSS

```html
<!-- Predefined type scale -->
<h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
<h2 class="text-3xl sm:text-4xl font-semibold">
<p class="text-base sm:text-lg leading-relaxed max-w-prose">

<!-- Font families -->
<body class="font-sans">
<code class="font-mono">
<blockquote class="font-serif">
```

### React / Next.js

```jsx
// next/font for optimized loading
import { Inter, Playfair_Display } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });
const playfair = Playfair_Display({ subsets: ['latin'] });

// Apply as className
<h1 className={playfair.className}>Heading</h1>
<p className={inter.className}>Body text</p>
```

## Learning Protocol

This skill participates in the shared learning system. After each use, outcomes are logged and patterns are extracted to improve future responses.

**See:** `shared/LEARNING-PROTOCOL.md` for the full protocol.
**Patterns:** `shared/PATTERNS-LIBRARY.json` for accumulated knowledge.
**Feedback:** `shared/FEEDBACK-LOG.json` for usage tracking.
