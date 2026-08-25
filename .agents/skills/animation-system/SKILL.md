---
name: animation-system
description: "Build a consistent animation system with design tokens, timing functions, and orchestration. This skill covers motion principles, duration tokens, easing curves, stagger patterns, entrance/exit choreography, and creating a unified motion language across a product. Use it whenever the user mentions animation system, motion design, animation tokens, animation principles, choreography, stagger, entrance animations, exit animations, or motion language. Trigger even when the user doesn't say 'animation system' but describes consistency needs: 'all my animations feel different', 'I need a unified motion language', 'animate everything consistently'. Also when discussing timing functions, spring configs, or animation architecture."
---

# Animation System Skill

## Core Principles

1. **Purposeful motion** — Every animation communicates something
2. **Consistent timing** — Same durations and easings across the product
3. **Layered choreography** — Entrance → emphasis → exit
4. **Performance first** — Animate transform and opacity only
5. **Respect preferences** — Always support `prefers-reduced-motion`

## Motion Principles

### The 5 Purposes of Animation

| Purpose | Example | Duration | Easing |
|---------|---------|----------|--------|
| **Feedback** | Button press, form submit | 100-200ms | ease-out |
| **State change** | Toggle, tab switch | 200-300ms | ease-in-out |
| **Direction** | Page transition, modal open | 300-500ms | spring/ease-out |
| **Emphasis** | Highlight, notification | 200-400ms | ease-out |
| **Delight** | Hover effects, micro-interactions | 200-500ms | spring |

### Duration Tokens

```css
:root {
  /* Duration scale (based on 100ms base) */
  --duration-instant: 0ms;
  --duration-fast: 100ms;
  --duration-normal: 200ms;
  --duration-moderate: 300ms;
  --duration-slow: 500ms;
  --duration-glacial: 800ms;

  /* Usage guidelines */
  /* instant:  Hover states, focus rings */
  /* fast:     Button feedback, toggles */
  /* normal:   State changes, small reveals */
  /* moderate: Page transitions, modals */
  /* slow:     Complex choreography, hero animations */
  /* glacial:  Ambient effects, background motion */
}
```

### Easing Tokens

```css
:root {
  /* Easing scale */
  --ease-default: cubic-bezier(0.25, 0.1, 0.25, 1);     /* Gentle deceleration */
  --ease-in: cubic-bezier(0.42, 0, 1, 1);                /* Slow start */
  --ease-out: cubic-bezier(0, 0, 0.58, 1);               /* Slow end */
  --ease-in-out: cubic-bezier(0.42, 0, 0.58, 1);         /* Symmetric */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);      /* Bouncy overshoot */
  --ease-elastic: cubic-bezier(0.68, -0.55, 0.27, 1.55); /* Elastic bounce */
  --ease-expo-out: cubic-bezier(0.16, 1, 0.3, 1);        /* Exponential decel */
  --ease-quad-out: cubic-bezier(0.25, 0.46, 0.45, 0.94); /* Quadratic decel */
}
```

### When to Use Each Easing

| Easing | Use When | Avoid When |
|--------|----------|------------|
| `ease-out` | Elements entering view | Elements exiting |
| `ease-in` | Elements exiting view | Elements entering |
| `ease-in-out` | Elements moving between positions | Quick feedback |
| `spring` | Playful interactions, buttons | Formal/professional UI |
| `expo-out` | Fast, premium feel | Slow, deliberate motion |

## Entrance Animations

### Fade In Up (Most Common)

```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-in {
  animation: fadeInUp var(--duration-moderate) var(--ease-out) forwards;
  opacity: 0; /* Start hidden */
}
```

### Scale In

```css
@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-scale-in {
  animation: scaleIn var(--duration-moderate) var(--ease-spring) forwards;
  opacity: 0;
}
```

### Slide In (Directional)

```css
@keyframes slideInLeft {
  from { transform: translateX(-24px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes slideInRight {
  from { transform: translateX(24px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes slideInUp {
  from { transform: translateY(24px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes slideInDown {
  from { transform: translateY(-24px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
```

### Fade In Scale

```css
@keyframes fadeInScale {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
```

## Exit Animations

### Fade Out

```css
@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

.animate-out {
  animation: fadeOut var(--duration-fast) var(--ease-in) forwards;
}
```

### Scale Out

```css
@keyframes scaleOut {
  from { opacity: 1; transform: scale(1); }
  to { opacity: 0; transform: scale(0.95); }
}
```

## Stagger Patterns

### CSS Stagger

```css
.stagger-item {
  opacity: 0;
  animation: fadeInUp var(--duration-moderate) var(--ease-out) forwards;
}

.stagger-item:nth-child(1) { animation-delay: 0ms; }
.stagger-item:nth-child(2) { animation-delay: 50ms; }
.stagger-item:nth-child(3) { animation-delay: 100ms; }
.stagger-item:nth-child(4) { animation-delay: 150ms; }
.stagger-item:nth-child(5) { animation-delay: 200ms; }

/* Dynamic stagger with CSS custom property */
.stagger-item {
  animation-delay: calc(var(--stagger-index, 0) * 50ms);
}
```

### JavaScript Stagger

```javascript
function staggerElements(elements, options = {}) {
  const {
    delay = 50,
    duration = 300,
    easing = 'cubic-bezier(0, 0, 0.58, 1)',
  } = options;

  elements.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(16px)';
    el.style.transition = `opacity ${duration}ms ${easing}, transform ${duration}ms ${easing}`;
    el.style.transitionDelay = `${i * delay}ms`;

    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
  });
}
```

### GSAP Stagger

```javascript
gsap.from('.list-item', {
  y: 20,
  opacity: 0,
  duration: 0.5,
  stagger: 0.05,
  ease: 'power2.out',
});
```

## Choreography

### Layered Animation Sequence

```css
/* Layer 1: Background (starts first) */
.hero-bg {
  animation: fadeIn var(--duration-slow) var(--ease-out) 0ms forwards;
  opacity: 0;
}

/* Layer 2: Content (starts after bg) */
.hero-content {
  animation: fadeInUp var(--duration-moderate) var(--ease-out) 200ms forwards;
  opacity: 0;
}

/* Layer 3: CTA (starts after content) */
.hero-cta {
  animation: fadeInUp var(--duration-moderate) var(--ease-out) 400ms forwards;
  opacity: 0;
}
```

### Page Transition Choreography

```javascript
// Exit current page
function exitPage() {
  return Promise.all([
    animate('.page-title', { opacity: 0, y: -20 }, { duration: 200 }),
    animate('.page-content', { opacity: 0, y: 20 }, { duration: 200, delay: 50 }),
  ]);
}

// Enter new page
function enterPage() {
  return Promise.all([
    animate('.page-title', { opacity: [0, 1], y: [20, 0] }, { duration: 300, delay: 100 }),
    animate('.page-content', { opacity: [0, 1], y: [20, 0] }, { duration: 300, delay: 200 }),
    animate('.page-cta', { opacity: [0, 1], y: [20, 0] }, { duration: 300, delay: 300 }),
  ]);
}
```

## Micro-Interactions

### Button Press

```css
.button {
  transition: transform var(--duration-fast) var(--ease-spring);
}

.button:active {
  transform: scale(0.97);
}

.button:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
```

### Toggle Switch

```css
.toggle-thumb {
  transition: transform var(--duration-normal) var(--ease-spring);
}

.toggle[aria-checked="true"] .toggle-thumb {
  transform: translateX(20px);
}
```

### Hover Lift

```css
.card {
  transition: transform var(--duration-normal) var(--ease-spring),
              box-shadow var(--duration-normal) var(--ease-out);
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
```

## Performance Rules

### Animate Only These Properties

| Property | Performance | Notes |
|----------|-------------|-------|
| `transform` | ✅ GPU | Translate, scale, rotate |
| `opacity` | ✅ GPU | Fade effects |
| `filter` | ⚠️ CPU | Blur, brightness (use sparingly) |
| `width`, `height` | ❌ Layout | Triggers reflow |
| `top`, `left` | ❌ Layout | Triggers reflow |
| `margin`, `padding` | ❌ Layout | Triggers reflow |
| `color`, `background` | ⚠️ Paint | Better than layout but not GPU |

### Will-Change

```css
/* ✅ Use sparingly, only for elements that will animate */
.will-animate {
  will-change: transform, opacity;
}

/* ✅ Remove after animation completes */
.animated-element {
  animation: fadeInUp 0.3s ease-out forwards;
  animation-fill-mode: forwards;
}

.animated-element.animated {
  will-change: auto; /* Remove after animation */
}
```

## Framework Patterns

### React

```jsx
// Animation wrapper component
function AnimatedElement({ children, delay = 0, className = '' }) {
  return (
    <div
      className={`animate-in ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// Usage
<AnimatedElement delay={0}>Title</AnimatedElement>
<AnimatedElement delay={100}>Subtitle</AnimatedElement>
<AnimatedElement delay={200}>CTA Button</AnimatedElement>
```

### Tailwind CSS

```html
<!-- Staggered entrance -->
<div class="animate-in" style="animation-delay: 0ms">Item 1</div>
<div class="animate-in" style="animation-delay: 50ms">Item 2</div>
<div class="animate-in" style="animation-delay: 100ms">Item 3</div>

<!-- With Tailwind config -->
<!-- @theme { --animate-fade-in: fadeIn 0.3s ease-out forwards; } -->
<div class="animate-fade-in">Content</div>
```

## Common Anti-Patterns

1. **No reduced motion** — Animations play for everyone regardless of preference
2. **Inconsistent timing** — Different durations for similar interactions
3. **Animating layout** — Using `width`, `height`, `top`, `left` instead of `transform`
4. **No stagger** — All elements animate at once instead of sequentially
5. **Over-animation** — Every element has animation, nothing feels special
6. **No exit animations** — Elements just disappear instead of fading out
7. **Blocking animations** — Animations that prevent user interaction
8. **Hardcoded values** — No design tokens, magic numbers everywhere

## Learning Protocol

This skill participates in the shared learning system. After each use, outcomes are logged and patterns are extracted to improve future responses.

**See:** `shared/LEARNING-PROTOCOL.md` for the full protocol.
**Patterns:** `shared/PATTERNS-LIBRARY.json` for accumulated knowledge.
**Feedback:** `shared/FEEDBACK-LOG.json` for usage tracking.
