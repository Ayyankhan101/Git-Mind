---
name: premium-web-animation
description: "Make websites feel expensive. This skill covers the full premium animation stack: scroll choreography (GSAP), smooth scrolling (Lenis), 3D experiences (Three.js), page transitions (Motion), gesture interactions (React Spring), micro-details (Anime.js), lightweight scroll triggers (Trig.js), and pre-built animated components (VengeanceUI). Use it whenever a site needs to feel cinematic, premium, or alive — landing pages, portfolios, product pages, creative sites. Trigger even when the user doesn't name libraries but describes premium outcomes: 'feel expensive', 'Apple-level', 'cinematic scroll', 'smooth scrolling', 'make it feel alive'. Also when comparing animation tools, choosing between Framer Motion and GSAP, discussing animation accessibility (prefers-reduced-motion), mobile animation performance, or deciding between React Spring and Motion for gesture-driven interactions."
---

# Premium Web Animation Skill

You build websites that feel expensive. Not just functional — the kind where visitors pause and think "who made this?" You combine the right animation libraries to create scroll effects, transitions, 3D elements, and micro-interactions that elevate a site from template-tier to cinematic.

## The Library Toolkit

Each library has a specific role. You don't use all of them for every project — you pick the ones that solve the actual problem.

### GSAP (gsap.com) — Cinematic Scroll Effects
The heavy hitter. Use GSAP when you need:
- Parallax scrolling, pin sections, scroll-triggered reveals
- Complex sequenced animations (intro sequences, narrative scroll)
- Any animation that involves coordinating multiple elements on a timeline
- ScrollSmoother for buttery scroll experiences

**When to reach for it:** The user wants "cinematic", "premium scroll", "parallax", "pinned sections", or a hero that unfolds as you scroll. This is almost always the first library you install.

**Scroll choreography warning:** Don't use Framer Motion's `whileInView` for scroll-choreographed animations — it fires once when an element enters the viewport, it can't scrub to scroll position, and it can't pin. Use GSAP ScrollTrigger for any animation that needs to be tied to scroll progress.

**Key packages:** `gsap`, `@gsap/react`, `ScrollTrigger` (plugin)

### Motion (motion.dev) — Zero-Setup Animations
The easiest path to polished motion. Use Motion when you need:
- Page transitions, layout animations, shared element transitions
- Spring-based physics that feel natural without tuning
- Simple enter/exit animations on components
- It works beautifully with React (and vanilla JS)

**When to reach for it:** The user wants animations that "just work" without deep configuration. Great for component-level motion, not ideal for scroll-heavy pages.

**Key packages:** `motion` (the unified package)

### React Spring (react-spring.dev) — Natural Interactions
Physics-based animations that respond to user input. Use React Spring when you need:
- Drag interactions, hover effects, toggle animations
- Animations that react to changing data (charts, counters, loaders)
- Spring physics that feel organic, not mechanical

**When to reach for it:** The user wants "natural feel", "responsive interactions", or animations tied to user gestures/data changes.

**Key packages:** `@react-spring/web`

### Three.js (threejs.org) — Real 3D
When flat design isn't enough. Use Three.js when you need:
- 3D product viewers, rotating objects, interactive scenes
- Particle systems, shader effects, depth-of-field
- WebGL-powered visuals that can't be faked with CSS

**When to reach for it:** The user explicitly wants 3D, mentions "WebGL", "particle effects", or wants a hero with real depth. Don't use it for simple parallax — GSAP handles that better.

**Key packages:** `three`, `@react-three/fiber`, `@react-three/drei`

### Anime.js (animejs.com) — Micro-Details
The finishing touch. Use Anime.js when you need:
- Small, delightful micro-interactions (button ripples, icon animations, loading spinners)
- Staggered list animations
- SVG path drawing and morphing
- Subtle details that make a site feel alive without dominating

**When to reach for it:** The user wants "polish", "micro-interactions", or "tiny details that make it feel alive". Don't use it for page-level animations — that's GSAP or Motion territory.

**Key packages:** `animejs` (v4 is the latest)

### VengeanceUI (github.com/Ashutoshx7/VengeanceUI) — Animated Landing Page Components
Copy-paste animated components for landing pages. Not an animation library — a component library that ships with animations built in. Use VengeanceUI when you need:
- Pre-built hero sections, navigation bars, product showcases, feature grids, testimonials
- Landing page components that are already animated (Framer Motion + Tailwind CSS)
- A fast starting point that you customize rather than build from scratch
- Components that look premium out of the box without deep animation work

**When to reach for it:** The user wants to build a landing page fast and doesn't want to hand-craft every component. Great for getting the structure right, then layering GSAP/Lenis on top for scroll choreography. Think of it as the component layer — GSAP and Lenis handle the scroll experience.

**Key details:** React + TypeScript + Tailwind CSS + Framer Motion. Copy-paste friendly. MIT license.

**How it fits in the stack:** VengeanceUI provides the component bones (hero, nav, features, testimonials). GSAP handles scroll choreography. Lenis handles smooth scroll. Anime.js handles micro-details. They don't overlap — each does its job.

### Trig.js (github.com/iDev-Games/Trig-JS) — Performant Scroll Animations
Lightweight and fast. Use Trig.js when you need:
- Scroll-based animations that won't slow down the site
- Simple scroll triggers without the overhead of GSAP
- Performance-critical pages where every frame counts

**When to reach for it:** The user mentions performance concerns, "lightweight", or wants scroll effects without the GSAP bundle size. Good for simpler scroll animations.

### Lenis (lenis.dev) — Premium Scrolling
The scroll engine that makes everything feel smoother. Use Lenis when you:
- Want smooth scrolling that feels premium (not the janky browser default)
- Are already using GSAP's ScrollTrigger (Lenis integrates seamlessly)
- Need to normalize scroll behavior across devices

**When to reach for it:** Always. Every premium site should have Lenis. It's ~3kB, integrates seamlessly with GSAP's ScrollTrigger, and the smooth scroll feel is what separates a template site from a crafted one. Only skip it if the user explicitly doesn't want smooth scrolling.

**Key packages:** `lenis`

## The Framer Motion Trap

Framer Motion (and its successor Motion) is the most common React animation library. Users will often ask for it by name. But it has hard limits that make it wrong for scroll-choreographed experiences:

| Feature | Framer Motion | GSAP ScrollTrigger |
|---|---|---|
| Page transitions | ✅ Excellent (AnimatePresence) | ✅ Good (more manual) |
| Component enter/exit | ✅ Excellent (whileInView) | ✅ Good (scrollTrigger) |
| Pinned scroll sections | ❌ No pin — CSS sticky is a workaround, not a solution | ✅ `pin: true` with full scrub control |
| Scrubbed timelines | ❌ Each useTransform is independent — can't sequence elements | ✅ Single timeline, scrub to scroll position |
| Multi-element coordination | ❌ Manual range math per element | ✅ Built-in stagger, labels, relative offsets |
| Scroll-linked rotation | ❌ Possible but imprecise | ✅ Frame-accurate via onUpdate callback |
| Bundle size | ~15kB | ~30kB (but covers 3x the use cases) |

**The rule:** If the user asks for Framer Motion but needs pinned sections, scrubbed timelines, or scroll-linked multi-element choreography, redirect them to GSAP. Explain *why* — don't just silently swap. Say something like:

> "Framer Motion is great for page transitions and component motion, but for pinned scroll sections with scrubbed timelines, GSAP ScrollTrigger is the right tool. Framer Motion can't pin sections or sequence animations to scroll position — you'd need CSS sticky as a workaround, which loses scrub precision."

If the user only needs simple viewport-enter animations (fade-in, slide-up), Framer Motion's `whileInView` is fine. Don't redirect unnecessarily.

## React Spring vs Motion: When Each Wins

Both handle component-level motion, but they shine in different scenarios:

| Use Case | Winner | Why |
|---|---|---|
| Page transitions (route changes) | Motion | AnimatePresence handles enter/exit cleanly |
| Layout animations (element resizes/moves) | Motion | layoutId enables shared element transitions |
| Drag interactions | React Spring | Spring physics feel more natural during drag |
| Hover tilt/3D card effects | React Spring | Configurable spring config for satisfying bounce |
| Data-driven animations (counters, charts) | React Spring | Springs respond to value changes naturally |
| Simple enter/exit | Either | Both work; Motion has simpler API |

**The shortcut:** If the user wants "smooth page transitions" → Motion. If they want "interactive, gesture-driven" → React Spring. If they want both on the same site, that's fine — they don't conflict.

## Decision Framework

When the user describes what they want, map their needs to libraries:

| They say... | You reach for... |
|---|---|
| "Hero section with scroll reveal" | GSAP + ScrollTrigger + Lenis |
| "Smooth page transitions" | Motion (or GSAP for complex ones) |
| "3D product viewer" | Three.js + React Three Fiber |
| "Button hover effects, icon animations" | Anime.js |
| "Drag and drop that feels good" | React Spring |
| "The whole site should feel premium" | GSAP + Lenis + Anime.js (details) |
| "I want it fast, not heavy" | Trig.js + Lenis |
| "Interactive data visualization" | React Spring or D3 |
| "Landing page fast, with pre-built components" | VengeanceUI + GSAP + Lenis |
| "Copy-paste animated components" | VengeanceUI + Tailwind |

**Layering rules:**
- Lenis is the foundation (smooth scroll) — add it unless the user explicitly doesn't want smooth scrolling
- GSAP handles scroll choreography and complex timelines
- Motion handles component-level transitions
- Anime.js handles the tiny details — hover states, loading states, icon wiggles
- React Spring handles user-gesture-driven motion
- Three.js only when real 3D is needed (don't fake it)

## Code Generation

### Project Setup Pattern

For a React/Next.js project with the full premium stack:

```bash
npm install gsap @gsap/react lenis motion animejs
# If 3D is needed:
npm install three @react-three/fiber @react-three/drei
# If spring physics are needed:
npm install @react-spring/web
# If using pre-built animated components:
npm install vengeance-ui tailwindcss
# Then copy-paste components from the VengeanceUI registry
```

### Lenis + GSAP Integration (the foundation)

```tsx
"use client";
import { useEffect, useRef } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });
    lenisRef.current = lenis;

    lenis.on("scroll", ScrollTrigger.update);

    gsap.ticker.add((time) => {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);

    return () => {
      lenis.destroy();
      gsap.ticker.remove(lenis.raf);
    };
  }, []);

  return <>{children}</>;
}
```

### GSAP ScrollTrigger Patterns

**Fade-in-up reveal:**
```tsx
"use client";
import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(ref.current,
      { opacity: 0, y: 60 },
      {
        opacity: 1, y: 0, duration: 1, ease: "power3.out",
        scrollTrigger: { trigger: ref.current, start: "top 85%", toggleActions: "play none none none" }
      }
    );
  }, []);

  return <div ref={ref} className={className}>{children}</div>;
}
```

**Pinned section with timeline:**
```tsx
"use client";
import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function PinnedSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const layer1Ref = useRef<HTMLDivElement>(null);
  const layer2Ref = useRef<HTMLDivElement>(null);
  const layer3Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "+=150%",
          pin: true,
          scrub: 1,
        },
      });
      tl.to(layer1Ref.current, { y: -200, ease: "none" })
        .to(layer2Ref.current, { y: -100, ease: "none" }, "<")
        .to(layer3Ref.current, { opacity: 1, scale: 1, ease: "power2.out" }, "-=0.5");
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="relative h-screen overflow-hidden">
      <div ref={layer1Ref} className="absolute inset-0">Background</div>
      <div ref={layer2Ref} className="absolute inset-0">Midground</div>
      <div ref={layer3Ref} className="absolute inset-0 scale-90 opacity-0">Foreground content</div>
    </div>
  );
}
```

**Staggered list reveal:**
```tsx
"use client";
import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function StaggeredList({ items }: { items: string[] }) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!listRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        listRef.current!.children,
        { opacity: 0, y: 40 },
        {
          opacity: 1, y: 0,
          duration: 0.6,
          stagger: 0.1,
          ease: "power2.out",
          scrollTrigger: {
            trigger: listRef.current,
            start: "top 80%",
          },
        }
      );
    }, listRef);
    return () => ctx.revert();
  }, []);

  return (
    <ul ref={listRef} className="space-y-4">
      {items.map((item, i) => (
        <li key={i} className="opacity-0">{item}</li>
      ))}
    </ul>
  );
}
```

### Motion Page Transitions

```tsx
"use client";
import { motion, AnimatePresence } from "motion/react";
import { usePathname } from "next/navigation";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

### Anime.js Micro-Interactions

```tsx
"use client";
import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";

export function AnimatedIcon() {
  const iconRef = useRef<SVGSVGElement>(null);

  const animateIn = () => {
    if (!iconRef.current) return;
    animate(iconRef.current.querySelectorAll("path"), {
      strokeDashoffset: ["100%", "0%"],
      duration: 800,
      delay: stagger(100),
      ease: "inOutSine",
    });
  };

  return (
    <svg ref={iconRef} onMouseEnter={animateIn} viewBox="0 0 24 24">
      {/* paths here */}
    </svg>
  );
}
```

### React Spring Interaction Pattern

```tsx
"use client";
import { useSpring, animated } from "@react-spring/web";

export function InteractiveCard() {
  const [springs, api] = useSpring(() => ({
    scale: 1,
    rotateX: 0,
    rotateY: 0,
    config: { mass: 1, tension: 280, friction: 24 },
  }));

  return (
    <animated.div
      style={{ ...springs, transformPerspective: 800 }}
      onMouseMove={({ clientX, clientY, currentTarget }) => {
        const rect = currentTarget.getBoundingClientRect();
        const x = (clientX - rect.left) / rect.width - 0.5;
        const y = (clientY - rect.top) / rect.height - 0.5;
        api.start({ rotateX: -y * 20, rotateY: x * 20, scale: 1.05 });
      }}
      onMouseLeave={() => api.start({ rotateX: 0, rotateY: 0, scale: 1 })}
      className="card"
    >
      <h3>Interactive Card</h3>
      <p>Hover to tilt</p>
    </animated.div>
  );
}
```

## Composition Guide

A premium site typically layers 3-4 libraries. Here's the recipe:

1. **Lenis** for smooth scrolling (the invisible foundation)
2. **GSAP** for scroll-triggered animations and timeline choreography
3. **VengeanceUI** for pre-built animated components (hero, nav, features, testimonials) — customize, don't rebuild
4. **Motion** or **React Spring** for component-level transitions
5. **Anime.js** for micro-details (button hovers, icon animations, loading states)

If using VengeanceUI: install its components first as the starting point, then add GSAP + Lenis on top for scroll choreography. Don't rebuild what VengeanceUI already provides — customize it.

Don't over-animate. The goal is to make the site feel alive, not to show off every library. Every animation should serve a purpose — guide attention, create hierarchy, or add delight. If an animation doesn't do one of those three things, cut it.

## Bundle Size Budget

Animation libraries add up. Keep the total animation budget under ~80kB gzipped for a premium site:

| Library | Gzipped Size | Worth It? |
|---|---|---|
| Lenis | ~3kB | Always |
| GSAP + ScrollTrigger | ~25kB | When you need scroll choreography |
| Motion | ~15kB | When you need page transitions |
| React Spring | ~12kB | When you need gesture-driven motion |
| Anime.js | ~8kB | When you need micro-details |
| Three.js | ~150kB | Only when real 3D is required |

**If bundle size is critical:** Use Trig.js (~2kB) instead of GSAP for simple scroll triggers. Drop Anime.js and handle micro-interactions with CSS transitions. Skip Three.js entirely.

## Accessibility

Premium animation must respect user preferences. Always wrap animations with reduced-motion support:

```tsx
"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function AccessibleReveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      // Show content immediately without animation
      gsap.set(ref.current, { opacity: 1, y: 0 });
      return;
    }

    gsap.fromTo(ref.current,
      { opacity: 0, y: 60 },
      {
        opacity: 1, y: 0, duration: 1, ease: "power3.out",
        scrollTrigger: { trigger: ref.current, start: "top 85%", toggleActions: "play none none none" }
      }
    );
  }, []);

  return <div ref={ref} className={className}>{children}</div>;
}
```

For CSS-based animations, use the `prefers-reduced-motion` media query:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

## Performance Rules

- Always use `will-change` sparingly and remove it after animations complete
- Use GSAP's `force3D: true` for GPU acceleration on complex animations
- Prefer `transform` and `opacity` over layout-triggering properties (width, height, top, left)
- Use Lenis with `lerp` for smooth scroll without performance hit
- Lazy-load Three.js scenes — don't render 3D in the viewport on initial load
- Use `gsap.matchMedia()` for responsive animations (different behavior on mobile vs desktop)
- Test scroll performance with Chrome DevTools Performance tab — aim for 60fps
- Use `gsap.context()` for cleanup in React — prevents memory leaks on unmount
- Avoid animating elements that are off-screen (use ScrollTrigger's `lazy: true` option)

## Mobile Considerations

Mobile devices have less GPU power and use touch scrolling. Adapt accordingly:

- **Reduce animation complexity on mobile** — fewer parallax layers, simpler timelines
- **Disable pinned sections on small screens** — they interfere with touch scrolling. Use `ScrollTrigger.matchMedia()`:
  ```tsx
  ScrollTrigger.matchMedia({
    "(min-width: 768px)": function() {
      // Desktop-only pinned animations
    },
    "(max-width: 767px)": function() {
      // Mobile: simpler reveal animations
    },
  });
  ```
- **Skip Three.js on mobile** if performance is critical — show a static image instead
- **Test on real devices** — Chrome DevTools throttling doesn't catch everything
- **Keep touch targets large** — animated elements that respond to hover should have a tap equivalent

## Common Anti-Patterns

- **Using Framer Motion for scroll choreography** — it can't pin, scrub, or sequence. Use GSAP.
- **Animating layout properties** — `width`, `height`, `top`, `left` cause reflows. Use `transform` and `opacity`.
- **Not cleaning up GSAP contexts** — always use `gsap.context()` in React and return `ctx.revert()` in cleanup.
- **Loading all libraries when you only need one** — pick the minimum set. Lenis + GSAP covers 80% of premium sites.
- **Ignoring reduced motion** — some users get nauseous from animations. Always check `prefers-reduced-motion`.
- **Over-animating** — if every element animates, nothing stands out. Animate what matters.

## Framework Notes

**React/Next.js:** All patterns above use React. Use `"use client"` for any component with animation hooks. GSAP's `@gsap/react` provides `useGSAP` for automatic cleanup.

**Vue/Nuxt:** GSAP and Anime.js work identically. Motion has a Vue adapter. Use `onMounted`/`onUnmounted` instead of `useEffect`.

**Vanilla JS:** All libraries work without frameworks. Use `gsap.context()` for cleanup and `document.querySelectorAll()` for targeting elements.

**Svelte:** GSAP and Anime.js work directly. Motion has Svelte support. Use `onMount`/`onDestroy` lifecycle.

When the user specifies a framework, adapt all code examples accordingly. When they don't, default to React/Next.js patterns but mention the framework adaptation.

---

## Self-Learning System

This skill improves over time. Every use teaches it something new. Here's how it works:

### Before Generating

1. **Read `learning/patterns-library.json`** — Check for proven composition recipes that match the user's use case. If a recipe exists with >80% success rate, use it as the foundation.
2. **Check anti-patterns** — Scan the anti-patterns list for anything that applies to the user's request. If a match is found, proactively warn the user.
3. **Check learned compositions** — Review any new rules learned from previous feedback that apply here.

### During Generation

- **Use proven recipes** when available — don't reinvent compositions that already work.
- **Avoid known anti-patterns** — if the user's approach matches an anti-pattern, explain why and suggest the fix.
- **Prefer tested patterns** — code patterns that have been validated in evals are more reliable than novel approaches.

### After Generating

Append a feedback entry to `learning/feedback-log.json`:

```json
{
  "id": "<uuid>",
  "timestamp": "<ISO-8601>",
  "prompt_summary": "<one-line summary>",
  "libraries_recommended": ["<list>"],
  "composition_pattern": "<pattern name>",
  "outcome": "accepted",
  "user_feedback": null,
  "new_pattern_detected": false,
  "anti_pattern_caught": false
}
```

### When User Gives Feedback

If the user says something changed, was wrong, or could be better:

1. **Update the feedback entry** — Set outcome to "modified" or "rejected", add user_feedback.
2. **Identify the gap** — What was missing or wrong?
3. **Add to review queue** — If it's a recurring pattern, add to `learning/review-queue.json`.
4. **If it's a new anti-pattern** — Add to `learning/patterns-library.json` anti_patterns array.
5. **If it's a new composition** — Add to `learning/patterns-library.json` composition_recipes array.

### Periodic Review

When the feedback log reaches 20 entries (or monthly):

1. **Read all feedback** — Look for patterns in accepted vs rejected outputs.
2. **Update patterns library** — Add new recipes, anti-patterns, and trigger insights.
3. **Clear review queue** — Apply approved improvements to SKILL.md.
4. **Repackage** — Create new .skill file.
5. **Log version** — Append to `learning/version-history.json`.

### Learning Files

| File | Purpose | Maintenance |
|---|---|---|
| `learning/protocol.md` | Full learning protocol documentation | Read to understand the system |
| `learning/patterns-library.json` | Accumulated recipes, anti-patterns, trigger insights | Growing, deduplicate on review |
| `learning/feedback-log.json` | Raw feedback from each use | Append-only, rotate monthly |
| `learning/review-queue.json` | Pending improvements | Clear items after applying |
| `learning/version-history.json` | Version tracking | Append-only, never delete |

### Success Metrics

| Metric | Target | How to Measure |
|---|---|---|
| Trigger accuracy | >95% | % of queries that correctly trigger/skip |
| User acceptance rate | >85% | % of outputs accepted without modification |
| Anti-pattern detection | >90% | % caught before user notices |
| Composition success | >80% | % of recommended compositions that work |

The goal is simple: the more this skill is used, the better it gets. Every interaction is a training example. Every failure is a lesson. Every success is a validated pattern.

## Shared Learning Protocol

This skill participates in a shared learning system with all 9 skills. Cross-skill patterns, anti-patterns, and insights are aggregated.

**See:** `shared/LEARNING-PROTOCOL.md` for the full protocol.
**Patterns:** `shared/PATTERNS-LIBRARY.json` for accumulated knowledge.
**Feedback:** `shared/FEEDBACK-LOG.json` for usage tracking.
