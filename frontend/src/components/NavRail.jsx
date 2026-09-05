import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FolderOpen,
  Command,
  Building2,
  RefreshCw,
  Lock,
  Github,
} from "../icons";
import { fs } from "../typeScale";
import { BASE, isValidGhToken } from "../api";
import * as tokenManager from "../tokenManager";
import { useEscClose } from "../hooks/useEscClose";
import { useFocusTrap } from "../hooks/useFocusTrap";
import ThemeSwitcher from "./ThemeSwitcher";

const IS_MAC = /Mac/i.test(
  navigator.userAgentData?.platform ?? navigator.platform,
);

export default function NavRail({
  activeTab,
  drawerOpen,
  isAnalyzing,
  analyzed,
  agentStatus,
  repos,
  tabs,
  dispatch,
  theme,
  ghToken,
}) {
  const mod = IS_MAC ? "⌘" : "Ctrl";

  const [tokenOpen, setTokenOpen] = useState(false);
  const tokenPopRef = useRef(null);
  const tokenSaveTimer = useRef(null);
  const debouncedTokenSave = useCallback((value) => {
    clearTimeout(tokenSaveTimer.current);
    tokenSaveTimer.current = setTimeout(() => tokenManager.set(value), 500);
  }, []);

  useEffect(() => {
    if (!tokenOpen) return;
    const onMouseDown = (e) => {
      if (tokenPopRef.current && !tokenPopRef.current.contains(e.target)) {
        setTokenOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [tokenOpen]);

  useEscClose(tokenOpen, () => setTokenOpen(false));
  const tokenPanelRef = useFocusTrap(tokenOpen);

  return (
    <nav
      className="nav-rail"
      role="navigation"
      aria-label="Main navigation"
      onKeyDown={(e) => {
        const items = [...e.currentTarget.querySelectorAll(".nav-item")];
        const idx = items.indexOf(document.activeElement);
        if (e.key === "ArrowRight") {
          e.preventDefault();
          items[(idx + 1) % items.length]?.focus();
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          items[(idx - 1 + items.length) % items.length]?.focus();
        }
      }}
    >
      <span className="nav-mark">GitMind</span>

      <div className="nav-items">
        <button
          className={`nav-item${drawerOpen ? " active" : ""}`}
          onClick={() =>
            dispatch({ type: "SET_DRAWER_OPEN", open: !drawerOpen })
          }
          data-tip="Repositories"
          aria-label="Repositories"
        >
          <FolderOpen size={18} />
          <span className="nav-label">Repos</span>
        </button>

        <div className="nav-divider" />

        {tabs.map(({ key, Icon, label, count, alert }) => (
          <button
            key={key}
            className={`nav-item${activeTab === key ? " active" : ""}`}
            onClick={() => dispatch({ type: "SET_ACTIVE_TAB", tab: key })}
            data-tip={label}
            aria-label={label}
            aria-current={activeTab === key ? "page" : undefined}
          >
            <Icon size={18} />
            <span className="nav-label">{label}</span>
            {count > 0 && (
              <span className={`nav-badge${alert ? " warn" : " info"}`}>
                {count > 99 ? "99+" : count}
              </span>
            )}
          </button>
        ))}
      </div>

      {(isAnalyzing || analyzed) && (
        <div
          className="nav-agents"
          title="Agent pipeline"
          aria-label="Agent pipeline status"
        >
          {[
            "scanner",
            "architecture",
            "api_docs",
            "security",
            "cve_scanner",
            "chat",
            "git_audit",
            "solidity",
            "code_audit",
          ].map((key) => (
            <div
              key={key}
              className={`nav-agent-dot ${agentStatus[key] || "waiting"}`}
              role="img"
              aria-label={`${key.replace(/_/g, " ")}: ${agentStatus[key] || "waiting"}`}
            />
          ))}
        </div>
      )}

      <div className="nav-actions">
        <div className="token-popover-wrap" ref={tokenPopRef}>
          <button
            className="nav-item"
            onClick={() => setTokenOpen((o) => !o)}
            data-tip="GitHub token"
            aria-label="GitHub token"
            aria-expanded={tokenOpen}
          >
            <Lock
              size={18}
              style={{
                color: ghToken
                  ? isValidGhToken(ghToken)
                    ? "var(--primary)"
                    : "var(--danger)"
                  : undefined,
              }}
            />
          </button>
          {tokenOpen && (
            <div className="token-popover" ref={tokenPanelRef}>
              <a className="lp-token-toggle" href={`${BASE}/auth/github/login`}>
                <Github size={12} />
                Sign in with GitHub
              </a>
              <label className="token-popover-label">
                GitHub Token (optional)
              </label>
              <div className="cb-input">
                <Lock
                  size={14}
                  style={{ color: "var(--text-3)", flexShrink: 0 }}
                />
                <input
                  type="password"
                  placeholder={
                    ghToken && !isValidGhToken(ghToken)
                      ? "unrecognized format"
                      : "Personal access token — ghp_…"
                  }
                  name="github-token"
                  aria-label="GitHub personal access token"
                  autoComplete="off"
                  spellCheck={false}
                  value={ghToken || ""}
                  onChange={(e) => {
                    dispatch({ type: "SET_GH_TOKEN", value: e.target.value });
                    debouncedTokenSave(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setTokenOpen(false);
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {(isAnalyzing || analyzed) && (
          <button
            className="nav-item"
            onClick={() => {
              dispatch({ type: "RESET_ANALYSIS" });
              window.location.href = "/";
            }}
            data-tip="New Analysis"
            aria-label="New analysis"
          >
            <RefreshCw size={18} />
            <span className="nav-label">New</span>
          </button>
        )}

        <ThemeSwitcher theme={theme} dispatch={dispatch} />

        {repos.length > 0 && (
          <button
            className="nav-item"
            onClick={() => dispatch({ type: "SET_SHOW_ORG_AUDIT", show: true })}
            data-tip="Org Audit"
            aria-label="Org Audit"
          >
            <Building2 size={18} />
          </button>
        )}

        <button
          className="nav-item"
          onClick={() => dispatch({ type: "SET_SHOW_PALETTE", show: true })}
          data-tip={`${mod}+K`}
          aria-label="Command palette"
        >
          <Command size={18} />
        </button>

        <button
          className="nav-item"
          onClick={() => dispatch({ type: "SET_SHOW_KB_HELP", show: true })}
          data-tip="Shortcuts"
          aria-label="Keyboard shortcuts"
        >
          <span style={{ fontSize: fs.base, fontWeight: 700, lineHeight: 1 }}>
            ?
          </span>
        </button>
      </div>
    </nav>
  );
}
