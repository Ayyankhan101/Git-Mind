import React, { useEffect } from "react";
import { Keyboard, X } from "lucide-react";

const isMac =
  typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

const SHORTCUTS = [
  {
    section: "General",
    items: [
      { desc: "Command palette", keys: [isMac ? "⌘" : "Ctrl", "K"] },
      { desc: "Keyboard shortcuts", keys: ["?"] },
      { desc: "Focus username input", keys: ["/"] },
      { desc: "Dismiss / close", keys: ["Esc"] },
      { desc: "Re-analyze repo", keys: [isMac ? "⌘" : "Ctrl", "R"] },
    ],
  },
  {
    section: "Navigation",
    items: [
      { desc: "Summary tab", keys: [isMac ? "⌘" : "Ctrl", "1"] },
      { desc: "Architecture tab", keys: [isMac ? "⌘" : "Ctrl", "2"] },
      { desc: "API Docs tab", keys: [isMac ? "⌘" : "Ctrl", "3"] },
      { desc: "Security tab", keys: [isMac ? "⌘" : "Ctrl", "4"] },
      { desc: "CVE tab", keys: [isMac ? "⌘" : "Ctrl", "5"] },
      { desc: "Git Audit tab", keys: [isMac ? "⌘" : "Ctrl", "6"] },
      { desc: "Solidity tab", keys: [isMac ? "⌘" : "Ctrl", "7"] },
      { desc: "Code Audit tab", keys: [isMac ? "⌘" : "Ctrl", "8"] },
      { desc: "PR Review tab", keys: [isMac ? "⌘" : "Ctrl", "9"] },
      { desc: "Chat tab", keys: [isMac ? "⌘" : "Ctrl", "0"] },
    ],
  },
  {
    section: "Architecture diagram",
    items: [
      { desc: "Zoom in", keys: ["+"] },
      { desc: "Zoom out", keys: ["-"] },
      { desc: "Reset zoom", keys: ["0"] },
      { desc: "Fit to screen", keys: ["F"] },
    ],
  },
  {
    section: "Sidebar",
    items: [
      { desc: "Navigate repos (up)", keys: ["↑"] },
      { desc: "Navigate repos (down)", keys: ["↓"] },
      { desc: "Select focused repo", keys: ["Enter"] },
    ],
  },
];

export default function KeyboardHelp({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="kbhelp-backdrop" onMouseDown={onClose}>
      <div className="kbhelp" onMouseDown={(e) => e.stopPropagation()}>
        <div className="kbhelp-header">
          <span className="kbhelp-icon">
            <Keyboard size={15} strokeWidth={1.5} />
          </span>
          <span className="kbhelp-title">Keyboard shortcuts</span>
          <span style={{ flex: 1 }} />
          <button className="btn-icon" onClick={onClose}>
            <X size={13} strokeWidth={1.5} />
          </button>
        </div>
        <div className="kbhelp-body">
          {SHORTCUTS.map((s) => (
            <div className="kbhelp-section" key={s.section}>
              <h3>{s.section}</h3>
              {s.items.map((it, i) => (
                <div className="kbhelp-row" key={i}>
                  <span>{it.desc}</span>
                  <span className="keys">
                    {it.keys.map((k, j) => (
                      <span className="k" key={j}>
                        {k}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
