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
    const observer = new MutationObserver(() => {
      setColor(resolve(varName, fallback));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [varName, fallback]);

  return color;
}
