import React from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeSwitcher({ theme, dispatch }) {
  const isDark = theme !== "light";

  return (
    <button
      className="btn-icon"
      onClick={() => dispatch({ type: "SET_THEME", theme: isDark ? "light" : "obsidian" })}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
