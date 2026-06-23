import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  BarChart3,
  GitBranch,
  FileCode2,
  ShieldAlert,
  Lock,
  GitPullRequest,
  MessageSquare,
  Share2,
  Download,
  Keyboard,
  AlignJustify,
  ZoomOut,
  ZoomIn,
  FolderOpen,
  Clock,
  ChevronRight,
} from "lucide-react";

const NAV_ITEMS = [
  {
    id: "tab:summary",
    label: "Go to Summary",
    icon: BarChart3,
    tab: "summary",
  },
  {
    id: "tab:diagram",
    label: "Go to Architecture",
    icon: GitBranch,
    tab: "diagram",
  },
  { id: "tab:docs", label: "Go to API Docs", icon: FileCode2, tab: "docs" },
  {
    id: "tab:security",
    label: "Go to Security",
    icon: ShieldAlert,
    tab: "security",
  },
  { id: "tab:cve", label: "Go to CVE Scanner", icon: Lock, tab: "cve" },
  { id: "tab:pr", label: "Go to PR Review", icon: GitPullRequest, tab: "pr" },
  { id: "tab:chat", label: "Go to Chat", icon: MessageSquare, tab: "chat" },
];

const ACTION_ITEMS = [
  {
    id: "action:share",
    label: "Share analysis",
    icon: Share2,
    sub: "Copy share link",
  },
  {
    id: "action:export",
    label: "Export report",
    icon: Download,
    sub: "Download Markdown",
  },
  {
    id: "action:kbhelp",
    label: "Keyboard shortcuts",
    icon: Keyboard,
    sub: "Show all shortcuts",
  },
  {
    id: "density:compact",
    label: "Compact density",
    icon: ZoomOut,
    density: "compact",
  },
  {
    id: "density:comfortable",
    label: "Comfortable density",
    icon: AlignJustify,
    density: "comfortable",
  },
  {
    id: "density:spacious",
    label: "Spacious density",
    icon: ZoomIn,
    density: "spacious",
  },
];

const THEME_ITEMS = [
  {
    id: "theme:obsidian",
    label: "Obsidian theme",
    sub: "Default dark",
    theme: "obsidian",
  },
  {
    id: "theme:daylight",
    label: "Daylight theme",
    sub: "Light mode",
    theme: "daylight",
  },
  {
    id: "theme:amber",
    label: "Amber theme",
    sub: "Warm paper",
    theme: "amber",
  },
  {
    id: "theme:verdant",
    label: "Verdant theme",
    sub: "Forest dark",
    theme: "verdant",
  },
  {
    id: "theme:glacier",
    label: "Glacier theme",
    sub: "Cool blue",
    theme: "glacier",
  },
  {
    id: "theme:aurora",
    label: "Aurora theme",
    sub: "Glass violet",
    theme: "aurora",
  },
  { id: "theme:mist", label: "Mist theme", sub: "Light glass", theme: "mist" },
];

function matches(item, q) {
  if (!q) return true;
  const ql = q.toLowerCase();
  return (
    item.label.toLowerCase().includes(ql) ||
    (item.sub && item.sub.toLowerCase().includes(ql))
  );
}

export default function CommandPalette({
  open,
  onClose,
  onAction,
  repos,
  recents,
  theme,
  density,
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const groups = useMemo(() => {
    const q = query.trim();
    const g = [];

    if (!q && recents.length) {
      g.push({
        label: "Recent",
        items: recents.map((r) => ({ ...r, icon: Clock })),
      });
    }

    const navFiltered = NAV_ITEMS.filter((i) => matches(i, q));
    if (navFiltered.length) g.push({ label: "Navigation", items: navFiltered });

    const actFiltered = ACTION_ITEMS.filter((i) => matches(i, q));
    if (actFiltered.length) g.push({ label: "Actions", items: actFiltered });

    const themeFiltered = THEME_ITEMS.filter((i) => matches(i, q));
    if (themeFiltered.length) g.push({ label: "Themes", items: themeFiltered });

    if (repos.length) {
      const repoItems = repos
        .filter(
          (r) =>
            !q ||
            r.name.toLowerCase().includes(q.toLowerCase()) ||
            (r.full_name || "").toLowerCase().includes(q.toLowerCase()),
        )
        .slice(0, 5)
        .map((r) => ({
          id: `repo:${r.name}`,
          label: r.name,
          sub: r.full_name,
          icon: FolderOpen,
          repo: r,
        }));
      if (repoItems.length) g.push({ label: "Repositories", items: repoItems });
    }

    return g;
  }, [query, recents, repos]);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, flatItems.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    }
    if (e.key === "Enter" && flatItems[cursor]) {
      e.preventDefault();
      onAction(flatItems[cursor]);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(".palette-item.active");
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  let itemIdx = 0;
  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input-row">
          <Search size={15} strokeWidth={1.5} />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Type a command or search…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <span className="palette-hint">
            <span className="kbd">Esc</span>
          </span>
        </div>
        <div className="palette-list" ref={listRef}>
          {groups.length === 0 && (
            <div className="palette-empty">No results for "{query}"</div>
          )}
          {groups.map((g) => (
            <div key={g.label}>
              <div className="palette-group">
                <span className="palette-group-label">{g.label}</span>
              </div>
              {g.items.map((item) => {
                const isActive = itemIdx === cursor;
                const idx = itemIdx++;
                const IconComp = item.icon;
                return (
                  <div
                    key={item.id}
                    className={`palette-item${isActive ? " active" : ""}`}
                    onMouseEnter={() => setCursor(idx)}
                    onClick={() => onAction(item)}
                  >
                    <span className="icon-slot">
                      {IconComp && <IconComp size={14} strokeWidth={1.5} />}
                    </span>
                    <span>{item.label}</span>
                    {item.sub && <span className="meta">{item.sub}</span>}
                    <ChevronRight
                      size={12}
                      strokeWidth={1.5}
                      className="palette-arrow"
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
