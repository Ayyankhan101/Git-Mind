import React, { Suspense, useMemo } from "react";
import {
  AlertTriangle,
  X,
  GitBranch,
  FileCode2,
  ShieldAlert,
  Lock,
  MessageSquare,
  Code2,
  BarChart3,
  GitPullRequest,
  GitCommit,
  Binary,
  Activity,
} from "../icons";
import NavRail from "./NavRail";
import Sidebar from "./Sidebar";
import ErrorBoundary from "./ErrorBoundary";
import { LANG_COLOR } from "../constants";

const DiagramTab = React.lazy(() => import("./DiagramTab"));
const DocsTab = React.lazy(() => import("./DocsTab"));
const SecurityTab = React.lazy(() => import("./SecurityTab"));
const ChatTab = React.lazy(() => import("./ChatTab"));
const SummaryTab = React.lazy(() => import("./SummaryTab"));
const CveTab = React.lazy(() => import("./CveTab"));
const PRReviewTab = React.lazy(() => import("./PRReviewTab"));
const GitAuditTab = React.lazy(() => import("./GitAuditTab"));
const SolidityTab = React.lazy(() => import("./SolidityTab"));
const CodeAuditTab = React.lazy(() => import("./CodeAuditTab"));
const MonitoringTab = React.lazy(() => import("./MonitoringTab"));

export default function DashboardLayout({
  state,
  dispatch,
  sessionId,
  handleLoadRepos,
  handleSelectRepo,
  handleAnalyze,
  handleFix,
}) {
  const {
    theme,
    githubUser,
    ghToken,
    repos,
    reposLoading,
    reposError,
    selectedRepoUrl,
    activeTab,
    repoName,
    isAnalyzing,
    analyzed,
    agentStatus,
    elapsedSec,
    diagram,
    archGraph,
    apiDocs,
    findings,
    cveFindings,
    gitAudit,
    solidityAudit,
    codeAudit,
    health,
    agentWarnings,
    fixLoading,
    fixResult,
    globalError,
    retryUrl,
    prAutoUrl,
    drawerOpen,
    repoHistory,
    loadedUsers,
  } = state;

  const selectedRepo = repos.find((r) => r.url === selectedRepoUrl) ?? null;

  const hasCritical = findings.some((f) => f.severity === "critical");
  const hasCveCritical = cveFindings.some(
    (f) => f.worst_severity === "critical",
  );

  const tabs = useMemo(
    () => [
      { key: "summary", Icon: BarChart3, label: "Summary" },
      { key: "diagram", Icon: GitBranch, label: "Architecture" },
      {
        key: "docs",
        Icon: FileCode2,
        label: "API Docs",
        count: apiDocs.length || null,
      },
      {
        key: "security",
        Icon: ShieldAlert,
        label: "Security",
        count: findings.length || null,
        alert: hasCritical,
      },
      {
        key: "cve",
        Icon: Lock,
        label: "CVE",
        count: cveFindings.length || null,
        alert: hasCveCritical,
      },
      {
        key: "git",
        Icon: GitCommit,
        label: "Git Audit",
        count:
          (gitAudit?.stats?.bad_messages || 0) +
            (gitAudit?.stats?.secrets_found || 0) +
            (gitAudit?.stats?.sensitive_files || 0) || null,
        alert: !!(
          gitAudit?.stats?.secrets_found || gitAudit?.stats?.sensitive_files
        ),
      },
      {
        key: "solidity",
        Icon: Binary,
        label: "Solidity",
        count: solidityAudit?.findings?.length || null,
        alert: solidityAudit?.findings?.some((f) => f.severity === "critical"),
      },
      {
        key: "code_audit",
        Icon: Code2,
        label: "Code Audit",
        count:
          codeAudit?.reduce((s, r) => s + (r.findings?.length || 0), 0) || null,
        alert: codeAudit?.some((r) =>
          r.findings?.some((f) => f.severity === "critical"),
        ),
      },
      { key: "pr", Icon: GitPullRequest, label: "PR Review" },
      { key: "monitor", Icon: Activity, label: "Watch" },
      { key: "chat", Icon: MessageSquare, label: "Chat" },
    ],
    [
      apiDocs,
      findings,
      cveFindings,
      gitAudit,
      solidityAudit,
      codeAudit,
      hasCritical,
      hasCveCritical,
    ],
  );

  return (
    <div className="app">
      <NavRail
        activeTab={activeTab}
        drawerOpen={drawerOpen}
        isAnalyzing={isAnalyzing}
        analyzed={analyzed}
        agentStatus={agentStatus}
        repos={repos}
        tabs={tabs}
        dispatch={dispatch}
        theme={theme}
        ghToken={ghToken}
      />

      <main id="main-content" className="main">
        <h1 className="sr-only">
          {repoName ? `${repoName} dashboard` : "GitMind dashboard"}
        </h1>
        {globalError && (
          <div
            className="error-banner-inline error-banner-inline--danger"
            role="alert"
          >
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>
              {globalError}
            </span>
            {retryUrl && (
              <button
                className="btn-text btn-text-primary"
                onClick={() => {
                  dispatch({ type: "CLEAR_ERROR" });
                  handleAnalyze(retryUrl);
                }}
              >
                Retry
              </button>
            )}
            <button
              className="btn-icon"
              onClick={() => dispatch({ type: "CLEAR_ERROR" })}
              aria-label="Dismiss error"
            >
              <X size={12} />
            </button>
          </div>
        )}
        {agentWarnings.map((w, i) => (
          <div
            key={i}
            className="error-banner-inline error-banner-inline--warning"
            role="status"
          >
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{w}</span>
            <button
              className="btn-icon"
              onClick={() =>
                dispatch({ type: "DISMISS_AGENT_WARNING", index: i })
              }
              aria-label="Dismiss warning"
            >
              <X size={12} />
            </button>
          </div>
        ))}

        {selectedRepo && analyzed && (
          <div className="meta-strip">
            <a
              href={selectedRepo.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {selectedRepo.full_name}
            </a>
            <span className="meta-sep">·</span>
            {selectedRepo.language && (
              <>
                <span
                  className="lang-dot"
                  style={{
                    background:
                      LANG_COLOR[selectedRepo.language] || "var(--text-3)",
                    width: 8,
                    height: 8,
                  }}
                />
                {selectedRepo.language}
                <span className="meta-sep">·</span>
              </>
            )}
            {selectedRepo.stars > 0 && (
              <>
                <span>★ {selectedRepo.stars.toLocaleString()}</span>
                <span className="meta-sep">·</span>
              </>
            )}
            {selectedRepo.fork && (
              <>
                <span>fork</span>
                <span className="meta-sep">·</span>
              </>
            )}
            <span>
              Updated {new Date(selectedRepo.updated_at).toLocaleDateString()}
            </span>
          </div>
        )}

        <div className="tab-content" role="tabpanel">
          <ErrorBoundary key={activeTab}>
            <Suspense
              fallback={<div className="tab-loading">Loading tab…</div>}
            >
              {activeTab === "summary" && (
                <SummaryTab
                  sessionId={sessionId}
                  enabled={analyzed}
                  repoName={repoName}
                  findings={findings}
                  apiDocs={apiDocs}
                  elapsedSec={elapsedSec}
                  isAnalyzing={isAnalyzing}
                  health={health}
                  healthPartial={state.healthPartial}
                  repoUrl={selectedRepoUrl}
                  ghToken={ghToken}
                  agentStatus={agentStatus}
                />
              )}
              {activeTab === "diagram" && (
                <DiagramTab
                  diagram={diagram}
                  archGraph={archGraph}
                  isAnalyzing={isAnalyzing}
                  analyzed={analyzed}
                  theme={theme}
                  sessionId={sessionId}
                  enabled={analyzed}
                  repoName={repoName}
                />
              )}
              {activeTab === "docs" && (
                <DocsTab
                  docs={apiDocs}
                  isAnalyzing={isAnalyzing}
                  analyzed={analyzed}
                  agentStatus={agentStatus}
                  onPickFile={(p) =>
                    dispatch({ type: "SET_FILE_PREVIEW", preview: p })
                  }
                />
              )}
              {activeTab === "security" && (
                <SecurityTab
                  findings={findings}
                  isAnalyzing={isAnalyzing}
                  analyzed={analyzed}
                  onCrisis={(f) =>
                    dispatch({ type: "SET_CRISIS_FINDING", finding: f })
                  }
                  onFix={handleFix}
                  fixLoading={fixLoading}
                  fixResult={fixResult}
                  onPickFile={(p) =>
                    dispatch({ type: "SET_FILE_PREVIEW", preview: p })
                  }
                  sessionId={sessionId}
                />
              )}
              {activeTab === "cve" && (
                <CveTab
                  findings={cveFindings}
                  isAnalyzing={isAnalyzing}
                  analyzed={analyzed}
                />
              )}
              {activeTab === "git" && (
                <GitAuditTab
                  audit={gitAudit}
                  isAnalyzing={isAnalyzing}
                  analyzed={analyzed}
                />
              )}
              {activeTab === "solidity" && (
                <SolidityTab
                  solAudit={solidityAudit}
                  isAnalyzing={isAnalyzing}
                  onFix={handleFix}
                  fixLoading={fixLoading}
                  fixResult={fixResult}
                />
              )}
              {activeTab === "code_audit" && (
                <CodeAuditTab
                  codeAudit={codeAudit}
                  isAnalyzing={isAnalyzing}
                  analyzed={analyzed}
                  onFix={handleFix}
                  fixLoading={fixLoading}
                  fixResult={fixResult}
                />
              )}
              {activeTab === "pr" && (
                <PRReviewTab
                  prAutoUrl={prAutoUrl}
                  onAutoUrlUsed={() =>
                    dispatch({ type: "SET_PR_AUTO_URL", url: null })
                  }
                  sessionId={sessionId}
                  analyzed={analyzed}
                  repoUrl={selectedRepoUrl}
                />
              )}
              {activeTab === "monitor" && (
                <MonitoringTab
                  ghToken={ghToken}
                  repoUrl={selectedRepoUrl}
                  analyzed={analyzed}
                />
              )}
              {activeTab === "chat" && (
                <ChatTab
                  key={repoName}
                  sessionId={sessionId}
                  enabled={analyzed}
                  repoName={repoName}
                />
              )}
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      <div
        className={`repo-drawer${drawerOpen ? " open" : ""}`}
        {...(!drawerOpen && { inert: "" })}
      >
        <div className="drawer-close">
          <span className="drawer-close-title">Repositories</span>
          <button
            className="btn-icon"
            onClick={() => dispatch({ type: "SET_DRAWER_OPEN", open: false })}
            title="Close"
            aria-label="Close repositories"
          >
            <X size={14} />
          </button>
        </div>
        <Sidebar
          repos={repos}
          onSelect={(url) => {
            handleSelectRepo(url);
            dispatch({ type: "SET_DRAWER_OPEN", open: false });
          }}
          selectedUrl={selectedRepoUrl}
          loading={reposLoading}
          error={reposError}
          history={repoHistory}
          onHistorySelect={(url) => {
            dispatch({ type: "SET_SELECTED_REPO_URL", url });
            handleAnalyze(url);
            dispatch({ type: "SET_DRAWER_OPEN", open: false });
          }}
          agentStatus={agentStatus}
          isAnalyzing={isAnalyzing}
          analyzed={analyzed}
          elapsedSec={elapsedSec}
          repoName={repoName}
          onLoadUser={handleLoadRepos}
          currentUser={githubUser || loadedUsers[0] || ""}
          loadedUsers={loadedUsers}
        />
      </div>
      {/* Global overlays (OrgAuditModal, CrisisChat, KeyboardHelp,
          FilePreviewDrawer, CommandPalette, ToastSystem) are owned by
          App.jsx — rendering them here too mounted every dialog twice. */}
    </div>
  );
}
