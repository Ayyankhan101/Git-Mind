import React, { useState, useRef, useEffect } from "react";
import { Palette, Check } from "lucide-react";

const THEMES = [
  { id: "obsidian", name: "Obsidian", sub: "Navy + Indigo", swatches: ["#08090e", "#7c6fe0"] },
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
  { id: "daylight", name: "Daylight", sub: "Light Mode", swatches: ["#fafafa", "#7c6fe0"] },
];

export default function ThemeSwitcher({ theme, dispatch }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = THEMES.find((t) => t.id === theme) || THEMES[0];

  return (
    <div className="theme-switcher" ref={ref}>
      <button
        className="theme-btn"
        onClick={() => setOpen(!open)}
        aria-label="Change theme"
        aria-expanded={open}
      >
        <Palette size={14} />
        <span>{current.name}</span>
      </button>

      {open && (
        <div className="theme-pop" role="listbox" aria-label="Theme picker">
          {THEMES.map((t) => (
            <div
              key={t.id}
              className={`theme-opt${theme === t.id ? " active" : ""}`}
              role="option"
              aria-selected={theme === t.id}
              onClick={() => {
                dispatch({ type: "SET_THEME", theme: t.id });
                setOpen(false);
              }}
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
