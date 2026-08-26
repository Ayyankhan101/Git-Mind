import React, { useRef, useCallback, useState, useEffect } from "react";
import { Search, FolderOpen, Share2, Download, Check, Lock } from "../icons";
import ThemeSwitcher from "./ThemeSwitcher";
import { isValidGhToken } from "../api";
import * as tokenManager from "../tokenManager";

export default function CommandBar({
  githubUser,
  ghToken,
  reposLoading,
  isAnalyzing,
  analyzed,
  shareCopied,
  statusClass,
  statusText,
  usernameRef,
  dispatch,
  handleLoadRepos,
  handleShare,
  handleExport,
  theme,
}) {
  const tokenSaveTimer = useRef(null);
  const [tokenOpen, setTokenOpen] = useState(false);
  const tokenPopRef = useRef(null);
  const debouncedTokenSave = useCallback((value) => {
    clearTimeout(tokenSaveTimer.current);
    tokenSaveTimer.current = setTimeout(() => tokenManager.set(value), 500);
  }, []);

  /* Close the token popover on outside click (mousedown, like
     ThemeSwitcher) or Escape. Enter inside the input also closes it. */
  useEffect(() => {
    if (!tokenOpen) return;
    const onMouseDown = (e) => {
      if (tokenPopRef.current && !tokenPopRef.current.contains(e.target)) {
        setTokenOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setTokenOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [tokenOpen]);
  return (
    <div className="command-bar">
      <span className="cb-wordmark">GitMind</span>

      <div
        className="cb-divider"
        style={{
          width: 1,
          height: 20,
          background: "var(--border)",
          margin: "0 4px",
        }}
      />

      <div className="cb-input">
        <Search size={14} />
        <input
          ref={usernameRef}
          placeholder="github username…"
          name="github-user"
          aria-label="GitHub username"
          autoComplete="off"
          spellCheck={false}
          value={githubUser}
          onChange={(e) => {
            dispatch({ type: "SET_GITHUB_USER", value: e.target.value });
            dispatch({ type: "SET_REPOS_ERROR", error: null });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !reposLoading && !isAnalyzing)
              handleLoadRepos();
          }}
          disabled={isAnalyzing}
        />
      </div>

      <div className="token-popover-wrap" ref={tokenPopRef}>
        <button
          className="btn-icon"
          onClick={() => setTokenOpen((o) => !o)}
          title="GitHub token settings"
          aria-label="GitHub token"
          aria-expanded={tokenOpen}
        >
          <Lock
            size={14}
            style={{
              color: ghToken
                ? isValidGhToken(ghToken)
                  ? "var(--primary)"
                  : "var(--danger)"
                : "var(--text-3)",
            }}
          />
        </button>
        {tokenOpen && (
          <div className="token-popover">
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
                value={ghToken}
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

      <button
        className="btn btn-ghost"
        onClick={() => handleLoadRepos()}
        disabled={reposLoading || isAnalyzing || !githubUser.trim()}
      >
        <FolderOpen size={13} />
        {reposLoading ? "Loading…" : "Load Repos"}
      </button>

      <span className="cb-spacer" />

      {(isAnalyzing || analyzed) && (
        <span className={`cb-status ${statusClass}`} role="status">
          {statusText}
        </span>
      )}

      <button
        className="btn-icon"
        onClick={handleShare}
        disabled={!analyzed}
        title="Share analysis"
        aria-label="Share analysis"
      >
        {shareCopied ? (
          <Check size={14} style={{ color: "var(--success)" }} />
        ) : (
          <Share2 size={14} />
        )}
      </button>

      <button
        className="btn-icon"
        onClick={handleExport}
        disabled={!analyzed}
        title="Export report"
        aria-label="Export report"
      >
        <Download size={14} />
      </button>

      <ThemeSwitcher theme={theme} dispatch={dispatch} />
    </div>
  );
}
