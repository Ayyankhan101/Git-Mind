import React from "react";
import { FolderOpen, Command, Building2 } from "lucide-react";

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
}) {
  const mod = IS_MAC ? "⌘" : "Ctrl";

  return (
    <nav className="nav-rail" role="navigation" aria-label="Main navigation">
      <button
        className={`nav-item${drawerOpen ? " active" : ""}`}
        onClick={() => dispatch({ type: "SET_DRAWER_OPEN", open: !drawerOpen })}
        data-tip="Repositories"
        aria-label="Repositories"
      >
        <FolderOpen size={18} strokeWidth={1.5} />
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
          <Icon size={18} strokeWidth={1.5} />
          <span className="nav-label">{label}</span>
          {count > 0 && (
            <span className={`nav-badge${alert ? " warn" : " info"}`}>
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      ))}

      {(isAnalyzing || analyzed) && (
        <div className="nav-agents" title="Agent pipeline" aria-label="Agent pipeline status">
          {["scanner", "architecture", "api_docs", "security", "cve_scanner", "chat", "git_audit", "solidity", "code_audit"].map((key) => (
            <div
              key={key}
              className={`nav-agent-dot ${agentStatus[key] || "waiting"}`}
            />
          ))}
        </div>
      )}

      <div className="nav-spacer" />

      {repos.length > 0 && (
        <button
          className="nav-item"
          onClick={() => dispatch({ type: "SET_SHOW_ORG_AUDIT", show: true })}
          data-tip="Org Audit"
          aria-label="Org Audit"
        >
          <Building2 size={18} strokeWidth={1.5} />
        </button>
      )}

      <button
        className="nav-item"
        onClick={() => dispatch({ type: "SET_SHOW_PALETTE", show: true })}
        data-tip={`${mod}+K`}
        aria-label="Command palette"
      >
        <Command size={18} strokeWidth={1.5} />
      </button>

      <button
        className="nav-item"
        onClick={() => dispatch({ type: "SET_SHOW_KB_HELP", show: true })}
        data-tip="Shortcuts"
        aria-label="Keyboard shortcuts"
      >
        <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>?</span>
      </button>
    </nav>
  );
}
