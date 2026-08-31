/**
 * Theme loader — single-surface design (cream/coral).
 *
 * Theme system removed in Phase 4. loadTheme() kept as no-op for
 * backward compatibility with callers (LandingPage, appReducer).
 */
export function loadTheme(_theme) {
  document.documentElement.dispatchEvent(
    new CustomEvent("theme-applied"),
  );
  return Promise.resolve();
}
