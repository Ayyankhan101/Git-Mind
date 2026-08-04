import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus inside a container element.
 * Returns a ref to attach to the container.
 */
export function useFocusTrap(isOpen) {
  const containerRef = useRef(null);
  const previousRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // Remember what was focused before opening
    previousRef.current = document.activeElement;

    const container = containerRef.current;
    if (!container) return;

    // Focus the first focusable element inside the container
    const focusFirst = () => {
      const els = container.querySelectorAll(FOCUSABLE);
      if (els.length > 0) els[0].focus();
    };

    // Small delay to let the DOM render
    const raf = requestAnimationFrame(focusFirst);

    const handleKeyDown = (e) => {
      if (e.key !== "Tab") return;

      const els = container.querySelectorAll(FOCUSABLE);
      if (els.length === 0) return;

      const first = els[0];
      const last = els[els.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: if on first, wrap to last
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if on last, wrap to first
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus to what was focused before
      if (previousRef.current && previousRef.current.focus) {
        previousRef.current.focus();
      }
    };
  }, [isOpen]);

  return containerRef;
}
