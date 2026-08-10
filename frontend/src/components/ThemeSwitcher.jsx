import React, { useState, useRef, useEffect } from "react";
import { Check, ChevronDown } from "lucide-react";

const THEMES = [
  { id: "obsidian", name: "Obsidian", sub: "Default dark", colors: ["#09090b", "#7c6fe0"] },
  { id: "daylight", name: "Daylight", sub: "Light mode", colors: ["#fafafa", "#6366f1"] },
  { id: "amber", name: "Amber", sub: "Warm paper", colors: ["#1a1612", "#f59e0b"] },
  { id: "verdant", name: "Verdant", sub: "Forest dark", colors: ["#0a100d", "#10b981"] },
  { id: "glacier", name: "Glacier", sub: "Cool blue", colors: ["#0b1220", "#38bdf8"] },
  { id: "aurora", name: "Aurora", sub: "Glass violet", colors: ["#0a0a18", "#a78bfa"] },
  { id: "spatial", name: "Spatial", sub: "Glass cyan", colors: ["#050510", "#22d3ee"] },
  { id: "mist", name: "Mist", sub: "Light glass", colors: ["#eef1f8", "#6366f1"] },
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
        onClick={() => setOpen((o) => !o)}
        title="Change theme"
        aria-label="Change theme"
      >
        <span
          className="swatch"
          style={{
            background: `linear-gradient(135deg, ${current.colors[0]} 50%, ${current.colors[1]} 50%)`,
          }}
        />
        {current.name}
        <ChevronDown size={11} style={{ opacity: 0.6 }} />
      </button>
      {open && (
        <div className="theme-pop" role="listbox" aria-label="Available themes">
          {THEMES.map((t) => (
            <div
              key={t.id}
              className={`theme-opt${t.id === theme ? " active" : ""}`}
              onClick={() => {
                dispatch({ type: "SET_THEME", theme: t.id });
                setOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  dispatch({ type: "SET_THEME", theme: t.id });
                  setOpen(false);
                }
              }}
              tabIndex={0}
              role="option"
              aria-selected={t.id === theme}
            >
              <div className="theme-opt-swatch">
                <span style={{ background: t.colors[0] }} />
                <span style={{ background: t.colors[1] }} />
              </div>
              <div>
                <div className="theme-opt-name">{t.name}</div>
                <div className="theme-opt-sub">{t.sub}</div>
              </div>
              {t.id === theme && <Check size={13} className="theme-opt-check" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
