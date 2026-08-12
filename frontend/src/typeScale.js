/**
 * Shared type scale.
 *
 * Single source of truth for font sizes: the CSS variables below are defined
 * once in src/design-tokens.css, and this module exposes them as a small,
 * semantic API for inline styles. Use `fontSize: fs.sm` instead of raw pixels
 * so every component scales from the same tokens.
 *
 *   fs.tiny    → 8px   (--fs-3xs)  SVG chart ticks
 *   fs.micro   → 10px  (--fs-2xs)  tiny meta / chart labels
 *   fs.xs      → 11px  (--fs-xs)   labels, meta strips, badges
 *   fs.sm      → 12px  (--fs-sm)   secondary body, table cells
 *   fs.md      → 13px  (--fs-md)   default body text
 *   fs.base    → 14px  (--fs-base) primary body / section headers
 *   fs.lg      → 16px  (--fs-lg)   emphasized text
 *   fs.xl      → 17px  (--fs-xl)   card / panel titles
 *   fs.xxl     → 20px  (--fs-2xl)  page titles
 *   fs.xxxl    → 22px  (--fs-3xl)  hero / display
 */
export const fs = {
  tiny: "var(--fs-3xs)",
  micro: "var(--fs-2xs)",
  xs: "var(--fs-xs)",
  sm: "var(--fs-sm)",
  md: "var(--fs-md)",
  base: "var(--fs-base)",
  lg: "var(--fs-lg)",
  xl: "var(--fs-xl)",
  xxl: "var(--fs-2xl)",
  xxxl: "var(--fs-3xl)",
};
