import { useState, useEffect } from "react";

function resolve(varName, fallback) {
  if (typeof document === "undefined") return fallback;
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return val || fallback;
}

/**
 * Resolves a CSS custom property to a concrete color value and
 * re-resolves whenever the theme (data-theme attribute) changes.
 * Three.js materials need real color strings — CSS vars don't resolve.
 */
export function useThemeColor(varName, fallback = "#3b82f6") {
  const [color, setColor] = useState(() => resolve(varName, fallback));

  useEffect(() => {
    setColor(resolve(varName, fallback));
    const reresolve = () => setColor(resolve(varName, fallback));
    const observer = new MutationObserver(reresolve);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    // Theme CSS chunks load async after the data-theme attribute flips;
    // re-resolve when the chunk actually lands.
    document.documentElement.addEventListener("theme-applied", reresolve);
    return () => {
      observer.disconnect();
      document.documentElement.removeEventListener("theme-applied", reresolve);
    };
  }, [varName, fallback]);

  return color;
}
