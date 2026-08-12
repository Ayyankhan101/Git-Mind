import React, { useRef, useCallback } from "react";
import { Search, FolderOpen, Share2, Download, Check, Lock } from "lucide-react";
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
  const debouncedTokenSave = useCallback((value) => {
    clearTimeout(tokenSaveTimer.current);
    tokenSaveTimer.current = setTimeout(() => tokenManager.set(value), 500);
  }, []);
  return (
    <div className="command-bar">
      <span className="cb-wordmark">GitMind</span>

      <div
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
          placeholder="github username"
          aria-label="GitHub username"
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

      <div className="cb-input" style={{ width: 190 }}>
        <Lock
          size={14}
          style={{
            color: ghToken
              ? isValidGhToken(ghToken)
                ? "var(--primary)"
                : "var(--danger)"
              : "var(--text-3)",
            flexShrink: 0,
          }}
        />
        <input
          type="password"
          placeholder={
            ghToken && !isValidGhToken(ghToken)
              ? "unrecognized format"
              : "token (optional)"
          }
          aria-label="GitHub personal access token"
          value={ghToken}
          onChange={(e) => {
            dispatch({ type: "SET_GH_TOKEN", value: e.target.value });
            debouncedTokenSave(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !reposLoading && !isAnalyzing)
              handleLoadRepos();
          }}
          disabled={isAnalyzing}
          style={{ minWidth: 0 }}
        />
      </div>

      <button
        className="btn btn-ghost"
        onClick={() => handleLoadRepos()}
        disabled={reposLoading || isAnalyzing || !githubUser.trim()}
      >
        <FolderOpen size={13} />
        {reposLoading ? "Loading…" : "Load Repos"}
      </button>

      <span style={{ flex: 1 }} />

      {(isAnalyzing || analyzed) && (
        <span className={`cb-status ${statusClass}`}>{statusText}</span>
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
