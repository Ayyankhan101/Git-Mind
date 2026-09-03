/**
 * Theme loader — lazy-loads theme CSS and applies via data-theme attribute.
 *
 * Each theme is a CSS file under src/themes/<id>.css that overrides
 * CSS custom properties on [data-theme="<id>"].
 *
 * "default" = no theme attribute (uses :root tokens from design-tokens.css).
 */

const THEME_IDS = new Set(["ocean", "forest", "sunset", "daylight", "obsidian"]);

let loadedThemes = new Set();

export function loadTheme(theme) {
  if (!theme || theme === "default") {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.dispatchEvent(new CustomEvent("theme-applied"));
    return Promise.resolve();
  }

  document.documentElement.setAttribute("data-theme", theme);

  if (loadedThemes.has(theme)) {
    document.documentElement.dispatchEvent(new CustomEvent("theme-applied"));
    return Promise.resolve();
  }

  if (!THEME_IDS.has(theme)) {
    document.documentElement.dispatchEvent(new CustomEvent("theme-applied"));
    return Promise.resolve();
  }

  return import(`./themes/${theme}.css`)
    .then(() => {
      loadedThemes.add(theme);
      document.documentElement.dispatchEvent(new CustomEvent("theme-applied"));
    })
    .catch((err) => {
      console.warn(`Failed to load theme "${theme}":`, err);
      document.documentElement.removeAttribute("data-theme");
      document.documentElement.dispatchEvent(new CustomEvent("theme-applied"));
    });
}
