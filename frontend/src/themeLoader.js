/**
 * Lazy theme loader.
 *
 * Each theme's CSS lives in its own file under src/themes/ and is code-split
 * by webpack into a separate chunk. Only the ACTIVE theme's chunk is fetched —
 * the 12 inactive themes (≈28 KB raw) never hit the network on first paint.
 *
 * "obsidian" (the Freebuff default) has no file: its palette is baked into the
 * base :root tokens in design-tokens.css, so it's always already loaded.
 */
const themeLoaders = {
  default: () => import("./themes/default.css"),
  amber: () => import("./themes/amber.css"),
  verdant: () => import("./themes/verdant.css"),
  glacier: () => import("./themes/glacier.css"),
  aurora: () => import("./themes/aurora.css"),
  spatial: () => import("./themes/spatial.css"),
  daylight: () => import("./themes/daylight.css"),
  matrix: () => import("./themes/matrix.css"),
  neon: () => import("./themes/neon.css"),
  carbon: () => import("./themes/carbon.css"),
  plasma: () => import("./themes/plasma.css"),
  circuit: () => import("./themes/circuit.css"),
};

/**
 * Ensure a theme's CSS chunk is loaded. Safe to call repeatedly — webpack
 * dedupes the module and the browser caches the chunk.
 */
export function loadTheme(theme) {
  const load = themeLoaders[theme];
  if (!load) return Promise.resolve();
  // Swallow chunk-load failures: a missing stylesheet must never break the
  // app — the base tokens still render a usable UI.
  return load().catch(() => {});
}
