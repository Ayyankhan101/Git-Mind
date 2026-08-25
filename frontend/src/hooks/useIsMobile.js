import { useState, useEffect } from "react";

/**
 * Hook to detect mobile viewport.
 * Returns true if viewport width < 768px.
 */
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    const handler = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);

  return isMobile;
}
