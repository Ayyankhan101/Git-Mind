import React, { useState, useRef, useEffect, useCallback } from "react";
import { Palette, Check } from "lucide-react";

const THEMES = [
  { id: "obsidian", name: "Freebuff", sub: "Electric Blue + Violet", swatches: ["#090a0f", "#3b82f6"] },
  { id: "default", name: "Default", sub: "Deep Blue + Violet", swatches: ["#0a0f1e", "#8b5cf6"] },
  { id: "amber", name: "Amber", sub: "Dark Brown + Amber", swatches: ["#1a1208", "#d4a74a"] },
  { id: "verdant", name: "Verdant", sub: "Forest + Emerald", swatches: ["#081208", "#22c55e"] },
  { id: "glacier", name: "Glacier", sub: "Slate + Cyan", swatches: ["#0a0f14", "#22d3ee"] },
  { id: "aurora", name: "Aurora", sub: "Multi-gradient", swatches: ["#0f0a18", "#a855f7"] },
  { id: "spatial", name: "Spatial", sub: "Deep Black + Cyan", swatches: ["#050508", "#22d3ee"] },
  { id: "matrix", name: "Matrix", sub: "Terminal Green", swatches: ["#0a0f0a", "#00ff41"] },
  { id: "neon", name: "Neon", sub: "Cyberpunk Pink", swatches: ["#0a0010", "#ff006e"] },
  { id: "carbon", name: "Carbon", sub: "Monochrome", swatches: ["#111111", "#ffffff"] },
  { id: "plasma", name: "Plasma", sub: "Electric Purple", swatches: ["#08041a", "#a855f7"] },
  { id: "circuit", name: "Circuit", sub: "Amber Tech", swatches: ["#0f0d08", "#f59e0b"] },
  { id: "daylight", name: "Daylight", sub: "Light Mode", swatches: ["#f8fafc", "#3b82f6"] },
];

export default function ThemeSwitcher({ theme, dispatch }) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const ref = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectTheme = useCallback((t) => {
    dispatch({ type: "SET_THEME", theme: t.id });
    setOpen(false);
  }, [dispatch]);

  const handleKeyDown = useCallback((e) => {
    if (!open) return;
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => (i + 1) % THEMES.length);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => (i - 1 + THEMES.length) % THEMES.length);
    }
    if (e.key === "Enter" && focusIdx >= 0) {
      e.preventDefault();
      selectTheme(THEMES[focusIdx]);
    }
  }, [open, focusIdx, selectTheme]);

  useEffect(() => {
    if (open && focusIdx >= 0 && listRef.current) {
      const opts = listRef.current.querySelectorAll('[role="option"]');
      opts[focusIdx]?.scrollIntoView({ block: "nearest" });
      opts[focusIdx]?.focus();
    }
  }, [focusIdx, open]);

  const current = THEMES.find((t) => t.id === theme) || THEMES[0];

  return (
    <div className="theme-switcher" ref={ref} onKeyDown={handleKeyDown}>
      <button
        className="theme-btn"
        onClick={() => { setOpen(!open); setFocusIdx(-1); }}
        aria-label="Change theme"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Palette size={14} />
        <span>{current.name}</span>
      </button>

      {open && (
        <div className="theme-pop" role="listbox" aria-label="Theme picker" ref={listRef}>
          {THEMES.map((t, i) => (
            <div
              key={t.id}
              className={`theme-opt${theme === t.id ? " active" : ""}`}
              role="option"
              tabIndex={focusIdx === i ? 0 : -1}
              aria-selected={theme === t.id}
              onClick={() => selectTheme(t)}
              onFocus={() => setFocusIdx(i)}
            >
              <div className="theme-opt-swatch">
                <span style={{ background: t.swatches[0] }} />
                <span style={{ background: t.swatches[1] }} />
              </div>
              <div>
                <div className="theme-opt-name">{t.name}</div>
                <div className="theme-opt-sub">{t.sub}</div>
              </div>
              {theme === t.id && <Check size={14} className="theme-opt-check" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
