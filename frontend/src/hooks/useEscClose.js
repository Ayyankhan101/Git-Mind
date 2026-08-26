import { useEffect, useRef } from "react";

/**
 * Escape-to-close with proper layer stacking.
 *
 * Every dialog registers via this hook instead of adding its own
 * window keydown listener. A module-level stack tracks open order;
 * Escape closes ONLY the topmost layer. Previously each dialog had
 * an independent listener, so one Esc press cascade-closed every
 * open layer simultaneously.
 *
 * Usage: useEscClose(open, onClose) — handler runs only while open.
 */
const stack = [];

export function useEscClose(open, onClose) {
  // Keep latest callback without re-registering on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const entry = { onClose: () => onCloseRef.current?.() };
    stack.push(entry);

    const handler = (e) => {
      if (e.key !== "Escape") return;
      // Only the topmost open layer responds.
      const top = stack[stack.length - 1];
      if (top !== entry) return;
      e.preventDefault();
      e.stopPropagation();
      entry.onClose();
    };
    window.addEventListener("keydown", handler);

    return () => {
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
      window.removeEventListener("keydown", handler);
    };
  }, [open]);
}
