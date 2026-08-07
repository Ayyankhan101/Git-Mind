import React, {
  useReducer,
  useRef,
  useCallback,
  useEffect,
  Suspense,
  lazy,
} from "react";
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
} from "lucide-react";

import Sidebar from "./components/Sidebar";
import LandingPage from "./components/LandingPage";
import ErrorBoundary from "./components/ErrorBoundary";
import ToastSystem from "./components/ToastSystem";
import CommandBar from "./components/CommandBar";
import NavRail from "./components/NavRail";
import {
  WS_BASE,
  fetchRepos,
  loadSharedAnalysis,
  generateFix,
} from "./api";
import { LANG_COLOR } from "./constants";
import { appReducer, initialState } from "./appReducer";
import * as tokenManager from "./tokenManager";

const DiagramTab = lazy(() => import("./components/DiagramTab"));
const DocsTab = lazy(() => import("./components/DocsTab"));
const SecurityTab = lazy(() => import("./components/SecurityTab"));
const ChatTab = lazy(() => import("./components/ChatTab"));
const SummaryTab = lazy(() => import("./components/SummaryTab"));
const CveTab = lazy(() => import("./components/CveTab"));
const PRReviewTab = lazy(() => import("./components/PRReviewTab"));
const CrisisChat = lazy(() => import("./components/CrisisChat"));
const KeyboardHelp = lazy(() => import("./components/KeyboardHelp"));
const FilePreviewDrawer = lazy(() => import("./components/FilePreviewDrawer"));
const GitAuditTab = lazy(() => import("./components/GitAuditTab"));
const SolidityTab = lazy(() => import("./components/SolidityTab"));
const CodeAuditTab = lazy(() => import("./components/CodeAuditTab"));
const MonitoringTab = lazy(() => import("./components/MonitoringTab"));
const OrgAuditModal = lazy(() => import("./components/OrgAuditModal"));
const CommandPalette = lazy(() => import("./components/CommandPalette"));

const IS_MAC = /Mac/i.test(
  navigator.userAgentData?.platform ?? navigator.platform,
);

const SESSION_ID =
  sessionStorage.getItem("gm-session-id") ||
  (() => {
    const id = crypto.randomUUID();
    sessionStorage.setItem("gm-session-id", id);
    return id;
  })();
const WS_URL = `${WS_BASE}/ws/analyze`;
const TIMEOUT_MS = 180_000;

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const {
    theme,
    density,
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
    crisisFinding,
    globalError,
    retryUrl,
    showOnboarding,
    showKbHelp,
    showPalette,
    filePreview,
    shareCopied,
    prAutoUrl,
    showOrgAudit,
    drawerOpen,
    repoHistory,
    recents,
    loadedUsers,
  } = state;

  // ── Refs ──────────────────────────────────────────────────
  const wsRef = useRef(null);

  // ── Restore theme & density from localStorage on mount ────
  useEffect(() => {
    const savedTheme = localStorage.getItem("gm-theme") || "obsidian";
    const savedDensity = localStorage.getItem("gm-density") || "comfortable";
    const root = document.documentElement;
    if (savedTheme === "obsidian") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", savedTheme);
    if (savedDensity === "comfortable") root.removeAttribute("data-density");
    else root.setAttribute("data-density", savedDensity);
  }, []);
  const timerRef = useRef(null);
  const timeoutRef = useRef(null);
  const startRef = useRef(null);
  const analyzingRef = useRef(false);
  const usernameRef = useRef(null);
  const toastTimers = useRef({});

  // ── Toast helpers ─────────────────────────────────────────
  const toastsRef = useRef([]);
  const [toasts, setToasts] = React.useState([]);
  toastsRef.current = toasts;

  const addToast = useCallback((toast) => {
    setToasts((arr) => {
      const key = `${toast.kind || "info"}::${toast.title}`;
      const existing = arr.find((x) => x.key === key);
      if (existing) {
        return arr.map((x) =>
          x.id === existing.id ? { ...x, count: (x.count || 1) + 1 } : x,
        );
      }
      const id = Date.now() + Math.random();
      const newToast = { ...toast, id, key };
      toastTimers.current[id] = setTimeout(() => {
        setToasts((a) => a.filter((t) => t.id !== id));
        delete toastTimers.current[id];
      }, toast.duration || 4000);
      return [...arr, newToast];
    });
  }, []);

  const dismissToast = useCallback((id) => {
    clearTimeout(toastTimers.current[id]);
    delete toastTimers.current[id];
    setToasts((arr) => arr.filter((t) => t.id !== id));
  }, []);

  // ── Restore persisted token ───────────────────────────────
  useEffect(() => {
    tokenManager.restore().then((t) => {
      if (t) dispatch({ type: "SET_GH_TOKEN", value: t });
    });
  }, []);

  // ── Cleanup ───────────────────────────────────────────────
  const cleanup = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    clearInterval(timerRef.current);
    timerRef.current = null;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    analyzingRef.current = false;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // ── Load shared analysis ──────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get("share");
    if (!shareId) return;
    loadSharedAnalysis(shareId)
      .then((data) => {
        dispatch({ type: "LOAD_SHARED_ANALYSIS", data });
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notification permission ───────────────────────────────
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // ── Global paste → PR auto-load ──────────────────────────
  useEffect(() => {
    const onPaste = (e) => {
      if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName))
        return;
      const text =
        (e.clipboardData || window.clipboardData)?.getData("text") || "";
      const prMatch = text.match(
        /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/,
      );
      if (prMatch) {
        dispatch({ type: "SET_PR_AUTO_URL", url: prMatch[0] });
        dispatch({ type: "SET_ACTIVE_TAB", tab: "pr" });
        dispatch({ type: "SET_SHOW_ONBOARDING", show: false });
        addToast({
          kind: "info",
          title: "PR URL detected",
          sub: "Opened PR Review tab",
        });
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addToast]);

  // ── Analysis complete side-effects ────────────────────────
  useEffect(() => {
    if (!analyzed) return;
    addToast({
      kind: "success",
      title: "Analysis complete",
      sub: `${repoName} · ${elapsedSec}s`,
    });
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("GitMind", { body: `${repoName} analysis complete` });
    }
    if (!selectedRepoUrl || !repoName) return;
    dispatch({
      type: "ADD_TO_HISTORY",
      entry: { url: selectedRepoUrl, name: repoName, ts: Date.now() },
    });
  }, [analyzed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Analyze ──────────────────────────────────────────────
  const handleAnalyze = useCallback(
    (url) => {
      if (!url) return;
      cleanup();
      dispatch({ type: "START_ANALYSIS", url });
      analyzingRef.current = true;

      startRef.current = Date.now();
      timerRef.current = setInterval(() => {
        dispatch({
          type: "SET_ELAPSED_SEC",
          sec: Math.floor((Date.now() - startRef.current) / 1000),
        });
      }, 1000);

      let ws;
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        dispatch({
          type: "ANALYSIS_ERROR",
          error:
            "WebSocket is not supported or the backend URL is misconfigured.",
          retryUrl: url,
        });
        cleanup();
        return;
      }
      wsRef.current = ws;

      const resetInactivityTimer = () => {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          dispatch({
            type: "ANALYSIS_ERROR",
            error:
              "Analysis timed out — no response from backend for 3 minutes. Large repos may take longer; try again.",
            retryUrl: url,
          });
          analyzingRef.current = false;
          clearInterval(timerRef.current);
          ws.close();
        }, TIMEOUT_MS);
      };

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            repo_url: url,
            session_id: SESSION_ID,
            ...(ghToken ? { gh_token: ghToken } : {}),
          }),
        );
        resetInactivityTimer();
      };

      ws.onmessage = (event) => {
        resetInactivityTimer();
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        if (data.agent_status)
          dispatch({ type: "SET_AGENT_STATUS", status: data.agent_status });
        if (data.architecture_diagram)
          dispatch({ type: "SET_DIAGRAM", diagram: data.architecture_diagram });
        if (data.architecture_graph)
          dispatch({ type: "SET_ARCH_GRAPH", graph: data.architecture_graph });
        if (data.api_docs?.length)
          dispatch({ type: "SET_API_DOCS", docs: data.api_docs });
        if (data.security_findings)
          dispatch({ type: "SET_FINDINGS", findings: data.security_findings });
        if (data.cve_findings)
          dispatch({ type: "SET_CVE_FINDINGS", findings: data.cve_findings });
        if (data.git_audit)
          dispatch({ type: "SET_GIT_AUDIT", audit: data.git_audit });
        if (data.solidity_audit)
          dispatch({ type: "SET_SOLIDITY_AUDIT", audit: data.solidity_audit });
        if (data.code_audit)
          dispatch({ type: "SET_CODE_AUDIT", audit: data.code_audit });
        if (data.health) dispatch({ type: "SET_HEALTH", health: data.health });
        if (data.health_partial)
          dispatch({ type: "SET_HEALTH_PARTIAL", health: data.health_partial });
        if (data.agent_timing)
          dispatch({ type: "SET_AGENT_TIMING", timing: data.agent_timing });
        if (data.agent_error) {
          const ev = data.agent_error;
          dispatch({
            type: "ADD_AGENT_WARNING",
            warning: `${ev.agent} agent failed: ${ev.detail || "check backend logs"}`,
          });
        }

        if (data.done) {
          clearInterval(timerRef.current);
          clearTimeout(timeoutRef.current);
          if (data.cached) {
            addToast({
              kind: "info",
              title: "Instant result",
              sub: "Served from cache — same commit",
            });
          }
          dispatch({ type: "ANALYSIS_DONE" });
          analyzingRef.current = false;
          ws.close();
        }
        if (data.error) {
          // Crash recovery: partial results available
          if (data.partial && data.health) {
            dispatch({ type: "SET_HEALTH", health: data.health });
            dispatch({
              type: "ADD_AGENT_WARNING",
              warning:
                "Analysis partially completed — showing available results.",
            });
            dispatch({ type: "ANALYSIS_DONE" });
          } else {
            dispatch({
              type: "ANALYSIS_ERROR",
              error: `Backend error: ${data.error}`,
            });
          }
          clearInterval(timerRef.current);
          analyzingRef.current = false;
          ws.close();
        }
      };

      ws.onerror = () => {
        if (!analyzingRef.current) return;
        clearInterval(timerRef.current);
        analyzingRef.current = false;
        dispatch({
          type: "ANALYSIS_ERROR",
          error:
            "Cannot reach the backend on port 8002. Start it with:\n  cd backend && uvicorn main:app --port 8002 --reload",
        });
      };

      ws.onclose = (evt) => {
        if (!evt.wasClean && analyzingRef.current) {
          clearInterval(timerRef.current);
          analyzingRef.current = false;
          dispatch({
            type: "ANALYSIS_ERROR",
            error:
              "Connection dropped unexpectedly. Check the backend terminal for errors.",
          });
        }
      };
    },
    [cleanup, addToast, ghToken],
  );

  // ── Global keyboard shortcuts ─────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const mod = IS_MAC ? e.metaKey : e.ctrlKey;
      if (showPalette) return;

      if (
        e.key === "?" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)
      ) {
        e.preventDefault();
        dispatch({ type: "SET_SHOW_KB_HELP", show: !showKbHelp });
      }
      if (mod && e.key === "k") {
        e.preventDefault();
        dispatch({ type: "SET_SHOW_PALETTE", show: true });
      }
      if (e.key === "Escape") {
        dispatch({ type: "SET_SHOW_KB_HELP", show: false });
        dispatch({ type: "SET_FILE_PREVIEW", preview: null });
        dispatch({ type: "SET_GLOBAL_ERROR", error: null });
      }
      if (mod && e.key === "1") {
        e.preventDefault();
        dispatch({ type: "SET_ACTIVE_TAB", tab: "summary" });
      }
      if (mod && e.key === "2") {
        e.preventDefault();
        dispatch({ type: "SET_ACTIVE_TAB", tab: "diagram" });
      }
      if (mod && e.key === "3") {
        e.preventDefault();
        dispatch({ type: "SET_ACTIVE_TAB", tab: "docs" });
      }
      if (mod && e.key === "4") {
        e.preventDefault();
        dispatch({ type: "SET_ACTIVE_TAB", tab: "security" });
      }
      if (mod && e.key === "5") {
        e.preventDefault();
        dispatch({ type: "SET_ACTIVE_TAB", tab: "cve" });
      }
      if (mod && e.key === "6") {
        e.preventDefault();
        dispatch({ type: "SET_ACTIVE_TAB", tab: "git" });
      }
      if (mod && e.key === "7") {
        e.preventDefault();
        dispatch({ type: "SET_ACTIVE_TAB", tab: "solidity" });
      }
      if (mod && e.key === "8") {
        e.preventDefault();
        dispatch({ type: "SET_ACTIVE_TAB", tab: "code_audit" });
      }
      if (mod && e.key === "9") {
        e.preventDefault();
        dispatch({ type: "SET_ACTIVE_TAB", tab: "pr" });
      }
      if (mod && e.key === "0") {
        e.preventDefault();
        dispatch({ type: "SET_ACTIVE_TAB", tab: "chat" });
      }
      if (mod && e.key === "r" && analyzed) {
        e.preventDefault();
        handleAnalyze(selectedRepoUrl);
      }
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)
      ) {
        e.preventDefault();
        usernameRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showPalette, analyzed, selectedRepoUrl, handleAnalyze, showKbHelp]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load repos ────────────────────────────────────────────
  const handleLoadRepos = useCallback(
    async (user) => {
      const u = (user || githubUser).trim();
      if (!u) {
        dispatch({
          type: "SET_REPOS_ERROR",
          error: "Enter a GitHub username.",
        });
        return;
      }
      dispatch({ type: "SET_REPOS_ERROR", error: null });
      dispatch({ type: "SET_REPOS_LOADING", loading: true });
      dispatch({ type: "SET_REPOS", repos: [] });
      dispatch({ type: "SET_SHOW_ONBOARDING", show: false });
      dispatch({
        type: "ADD_RECENT",
        cmd: { id: `user:${u}`, label: u, sub: "GitHub user", icon: "user" },
      });
      try {
        const list = await fetchRepos(u, ghToken || null);
        dispatch({ type: "SET_REPOS", repos: list });
        if (list.length === 0)
          dispatch({
            type: "SET_REPOS_ERROR",
            error: ghToken
              ? "No repositories found."
              : "No public repositories found.",
          });
        else {
          const hasPrivate = list.some((r) => r.private);
          addToast({
            kind: "info",
            title: `Loaded ${list.length} repos${hasPrivate ? " (incl. private)" : ""}`,
            sub: u,
          });
          dispatch({ type: "ADD_LOADED_USER", user: u });
        }
      } catch (err) {
        dispatch({ type: "SET_REPOS_ERROR", error: err.message });
        addToast({
          kind: "danger",
          title: "Failed to load repos",
          sub: err.message,
        });
      } finally {
        dispatch({ type: "SET_REPOS_LOADING", loading: false });
      }
    },
    [githubUser, ghToken, addToast],
  );

  // ── Select + analyze ──────────────────────────────────────
  const handleSelectRepo = useCallback(
    (url) => {
      dispatch({ type: "SET_SELECTED_REPO_URL", url });
      handleAnalyze(url);
    },
    [handleAnalyze],
  );

  // ── Export ────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!analyzed) return;
    try {
      const { buildAnalysisPdf, downloadPdf } = await import("./pdfBuilder");
      const docDef = buildAnalysisPdf({
        repoName,
        diagram,
        archGraph,
        apiDocs,
        findings,
        cveFindings,
        gitAudit,
        solidityAudit,
        codeAudit,
        health,
        elapsedSec,
      });
      downloadPdf(docDef, `gitmind-${repoName}-${Date.now()}.pdf`);
      addToast({
        kind: "success",
        title: "Report exported",
        sub: `${repoName}.pdf`,
      });
      dispatch({
        type: "ADD_RECENT",
        cmd: {
          id: "action:export",
          label: "Export report",
          sub: "Action",
          icon: "download",
        },
      });
    } catch (err) {
      addToast({
        kind: "danger",
        title: "Export failed",
        sub: err.message || "Could not generate report.",
      });
    }
  }, [
    analyzed,
    repoName,
    diagram,
    archGraph,
    apiDocs,
    findings,
    cveFindings,
    gitAudit,
    solidityAudit,
    codeAudit,
    health,
    elapsedSec,
    addToast,
  ]);

  // ── Generate fix ──────────────────────────────────────────
  const handleFix = useCallback(
    async (finding) => {
      dispatch({ type: "SET_FIX_LOADING", id: finding.id ?? finding.rule });
      dispatch({ type: "SET_FIX_RESULT", result: null });
      try {
        const data = await generateFix(SESSION_ID, finding);
        dispatch({
          type: "SET_FIX_RESULT",
          result: { ...data, finding_id: finding.id ?? finding.rule },
        });
        addToast({
          kind: "success",
          title: "Fix generated",
          sub: finding.rule || finding.id,
        });
      } catch (err) {
        addToast({
          kind: "danger",
          title: "Fix generation failed",
          sub: err.message,
        });
      } finally {
        dispatch({ type: "SET_FIX_LOADING", id: null });
      }
    },
    [addToast],
  );

  // ── Share ─────────────────────────────────────────────────
  const handleShare = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?share=${SESSION_ID}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        dispatch({ type: "SET_SHARE_COPIED", copied: true });
        setTimeout(
          () => dispatch({ type: "SET_SHARE_COPIED", copied: false }),
          2500,
        );
        addToast({
          kind: "success",
          title: "Link copied",
          sub: "Share URL in clipboard",
        });
        dispatch({
          type: "ADD_RECENT",
          cmd: {
            id: "action:share",
            label: "Share analysis",
            sub: "Action",
            icon: "share",
          },
        });
      })
      .catch(() => {
        window.prompt("Copy this link:", url);
      });
  }, [addToast]);

  // ── Palette action handler ────────────────────────────────
  const handlePaletteAction = useCallback(
    (action) => {
      dispatch({ type: "SET_SHOW_PALETTE", show: false });
      if (action.tab) {
        dispatch({ type: "SET_ACTIVE_TAB", tab: action.tab });
        dispatch({ type: "ADD_RECENT", cmd: action });
      }
      if (action.density) {
        dispatch({ type: "SET_DENSITY", density: action.density });
        dispatch({ type: "ADD_RECENT", cmd: action });
      }
      if (action.theme) {
        dispatch({ type: "SET_THEME", theme: action.theme });
        dispatch({ type: "ADD_RECENT", cmd: action });
      }
      if (action.id === "action:share") handleShare();
      if (action.id === "action:export") handleExport();
      if (action.repo) {
        handleSelectRepo(action.repo.url);
        dispatch({ type: "ADD_RECENT", cmd: action });
      }
      if (action.id === "action:kbhelp")
        dispatch({ type: "SET_SHOW_KB_HELP", show: true });
    },
    [handleShare, handleExport, handleSelectRepo],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tab metadata ──────────────────────────────────────────
  const hasCritical = findings.some((f) => f.severity === "critical");
  const hasCveCritical = cveFindings.some(
    (f) => f.worst_severity === "critical",
  );
  const selectedRepo = repos.find((r) => r.url === selectedRepoUrl) ?? null;

  const tabs = [
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
  ];

  // ── Status text ───────────────────────────────────────────
  const statusClass = analyzed ? "done" : isAnalyzing ? "running" : "";
  const statusText = analyzed
    ? `Done · ${elapsedSec}s`
    : isAnalyzing
      ? `Analyzing · ${elapsedSec}s`
      : "Ready";

  return (
    <div className="app">
      <CommandBar
        githubUser={githubUser}
        ghToken={ghToken}
        reposLoading={reposLoading}
        isAnalyzing={isAnalyzing}
        analyzed={analyzed}
        shareCopied={shareCopied}
        statusClass={statusClass}
        statusText={statusText}
        usernameRef={usernameRef}
        dispatch={dispatch}
        handleLoadRepos={handleLoadRepos}
        handleShare={handleShare}
        handleExport={handleExport}
        theme={theme}
      />

      <NavRail
        activeTab={activeTab}
        drawerOpen={drawerOpen}
        isAnalyzing={isAnalyzing}
        analyzed={analyzed}
        agentStatus={agentStatus}
        repos={repos}
        tabs={tabs}
        dispatch={dispatch}
      />

      {/* ── Main content ────────────────────────────────────────── */}
      <div className="main">
        {globalError && (
          <div className="error-banner" role="alert">
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>
              {globalError}
            </span>
            {retryUrl && (
              <button
                className="btn-text"
                style={{
                  color: "var(--primary)",
                  flexShrink: 0,
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
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
            className="error-banner"
            role="status"
            style={{
              borderColor: "var(--warning-bg-strong)",
              background: "var(--warning-bg)",
              color: "var(--warning)",
            }}
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
          {showOnboarding && !repos.length ? (
            <LandingPage
              onLoad={handleLoadRepos}
              onAnalyzeUrl={handleSelectRepo}
            />
          ) : (
            <ErrorBoundary key={activeTab}>
              <Suspense
                fallback={<div className="tab-loading">Loading tab…</div>}
              >
                {activeTab === "summary" && (
                  <SummaryTab
                    sessionId={SESSION_ID}
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
                  />
                )}
                {activeTab === "diagram" && (
                  <DiagramTab
                    diagram={diagram}
                    archGraph={archGraph}
                    isAnalyzing={isAnalyzing}
                    analyzed={analyzed}
                    theme={theme}
                    sessionId={SESSION_ID}
                    enabled={analyzed}
                    repoName={repoName}
                  />
                )}
                {activeTab === "docs" && (
                  <DocsTab
                    docs={apiDocs}
                    isAnalyzing={isAnalyzing}
                    analyzed={analyzed}
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
                    sessionId={SESSION_ID}
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
                    sessionId={SESSION_ID}
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
                    sessionId={SESSION_ID}
                    enabled={analyzed}
                    repoName={repoName}
                  />
                )}
              </Suspense>
            </ErrorBoundary>
          )}
        </div>
      </div>

      {/* ── Repo drawer ─────────────────────────────────────────── */}
      <div
        className={`repo-drawer${drawerOpen ? " open" : ""}`}
        aria-hidden={!drawerOpen}
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

      {/* ── Overlays ────────────────────────────────────────────── */}
      <ErrorBoundary>
      <Suspense fallback={null}>
        {showOrgAudit && (
          <OrgAuditModal
            repos={repos}
            token={ghToken || null}
            onClose={() =>
              dispatch({ type: "SET_SHOW_ORG_AUDIT", show: false })
            }
          />
        )}
        {crisisFinding && (
          <CrisisChat
            finding={crisisFinding}
            sessionId={SESSION_ID}
            repoName={repoName}
            onClose={() =>
              dispatch({ type: "SET_CRISIS_FINDING", finding: null })
            }
          />
        )}
        <KeyboardHelp
          open={showKbHelp}
          onClose={() => dispatch({ type: "SET_SHOW_KB_HELP", show: false })}
        />
        <FilePreviewDrawer
          path={filePreview?.path}
          line={filePreview?.line}
          repoUrl={selectedRepoUrl}
          ghToken={ghToken}
          onClose={() => dispatch({ type: "SET_FILE_PREVIEW", preview: null })}
        />
        <CommandPalette
          open={showPalette}
          onClose={() => dispatch({ type: "SET_SHOW_PALETTE", show: false })}
          onAction={handlePaletteAction}
          repos={repos}
          recents={recents}
          theme={theme}
          density={density}
        />
      </Suspense>
      </ErrorBoundary>
      <ToastSystem toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
