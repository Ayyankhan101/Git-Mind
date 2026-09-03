import React, { useState, useRef, useEffect, useCallback } from "react";
import { Palette } from "../icons";

const THEMES = [
  {
    id: "default",
    name: "Coral",
    sub: "Warm editorial",
    swatches: ["#faf9f5", "#cc785c"],
  },
  {
    id: "ocean",
    name: "Ocean",
    sub: "Technical blue",
    swatches: ["#f8fafc", "#2563eb"],
  },
  {
    id: "forest",
    name: "Forest",
    sub: "Natural green",
    swatches: ["#f9faf6", "#3d8b5a"],
  },
  {
    id: "sunset",
    name: "Sunset",
    sub: "Warm amber",
    swatches: ["#fefbf4", "#d97706"],
  },
  {
    id: "obsidian",
    name: "Obsidian",
    sub: "Dark studio",
    swatches: ["#08090e", "#7c6fe0"],
  },
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

  const selectTheme = useCallback(
    (t) => {
      dispatch({ type: "SET_THEME", theme: t.id });
      setOpen(false);
    },
    [dispatch],
  );

  const handleKeyDown = useCallback(
    (e) => {
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
      if ((e.key === "Enter" || e.key === " ") && focusIdx >= 0) {
        e.preventDefault();
        selectTheme(THEMES[focusIdx]);
      }
    },
    [open, focusIdx, selectTheme],
  );

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
        onClick={() => {
          setOpen(!open);
          setFocusIdx(-1);
        }}
        aria-label="Change theme"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Palette size={14} />
        <span>{current.name}</span>
      </button>

      {open && (
        <div
          className="theme-pop"
          role="listbox"
          aria-label="Theme picker"
          ref={listRef}
        >
          <div className="theme-grid">
            {THEMES.map((t, i) => (
              <div
                key={t.id}
                className={`theme-grid-item${theme === t.id ? " active" : ""}`}
                role="option"
                tabIndex={focusIdx === i ? 0 : -1}
                aria-selected={theme === t.id}
                onClick={() => selectTheme(t)}
                onFocus={() => setFocusIdx(i)}
              >
                <div className="theme-grid-swatch">
                  <span style={{ background: t.swatches[0] }} />
                  <span style={{ background: t.swatches[1] }} />
                </div>
                <div className="theme-grid-info">
                  <div className="theme-grid-name">{t.name}</div>
                  <div className="theme-grid-sub">{t.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
