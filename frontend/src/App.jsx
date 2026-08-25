import React, {
  useReducer,
  useRef,
  useCallback,
  useEffect,
  Suspense,
  lazy,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import LandingPage from "./components/LandingPage";
import ErrorBoundary from "./components/ErrorBoundary";
import ToastSystem from "./components/ToastSystem";
import SceneManager from "./components/SceneManager";
import DashboardScene from "./components/DashboardScene";
import PostProcessing from "./components/PostProcessing";
import { WS_BASE, fetchRepos, loadSharedAnalysis, generateFix } from "./api";
import { appReducer, initialState } from "./appReducer";
import * as tokenManager from "./tokenManager";
import { loadTheme } from "./themeLoader";

// Dashboard shell (CommandBar/NavRail/Sidebar + all tabs) is lazy-loaded so
// the landing page doesn't ship the full 400KB+ dashboard bundle.
const DashboardLayout = lazy(() => import("./components/DashboardLayout"));
const CrisisChat = lazy(() => import("./components/CrisisChat"));
const KeyboardHelp = lazy(() => import("./components/KeyboardHelp"));
const FilePreviewDrawer = lazy(() => import("./components/FilePreviewDrawer"));
const OrgAuditModal = lazy(() => import("./components/OrgAuditModal"));
const CommandPalette = lazy(() => import("./components/CommandPalette"));
const ShareErrorOverlay = lazy(() => import("./components/ShareErrorOverlay"));

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

function classifyShareError(err) {
  const status = err?.status;
  if (status === 404)
    return {
      kind: "not_found",
      message:
        "This analysis link has expired or the analysis was never saved.",
    };
  if (status === 401)
    return {
      kind: "locked",
      message:
        "This analysis is locked. Add your GitHub token to unlock it — analyses older than 24 hours require authentication.",
    };
  if (status === 429)
    return {
      kind: "rate_limited",
      message: "Too many requests. Please wait a moment and try again.",
    };
  if (status === 0 || status === undefined)
    return {
      kind: "network",
      message:
        "Cannot reach the GitMind backend. Check your connection and try again.",
    };
  return {
    kind: "generic",
    message: err?.message || "Could not load the shared analysis.",
  };
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(appReducer, initialState);
  const {
    theme,
    density,
    githubUser,
    ghToken,
    repos,
    selectedRepoUrl,
    repoName,
    isAnalyzing,
    analyzed,
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
    crisisFinding,
    showKbHelp,
    showPalette,
    filePreview,
    showOrgAudit,
    shareError,
    recents,
  } = state;

  // ── Refs ──────────────────────────────────────────────────
  const wsRef = useRef(null);

  // ── Restore theme & density from localStorage on mount ────
  useEffect(() => {
    const savedTheme = localStorage.getItem("gm-theme");
    const savedDensity = localStorage.getItem("gm-density") || "comfortable";
    const root = document.documentElement;
    if (savedTheme && savedTheme !== "obsidian")
      root.setAttribute("data-theme", savedTheme);
    else root.removeAttribute("data-theme");
    if (savedDensity === "comfortable") root.removeAttribute("data-density");
    else root.setAttribute("data-density", savedDensity);
  }, []);

  // ── Lazy-load the active theme's CSS chunk ─────────────────
  // Fires on mount (restores the saved theme) and on every switch
  // (ThemeSwitcher + command palette). webpack fetches only the one
  // theme file being used; the other 12 stay off the network.
  useEffect(() => {
    loadTheme(theme);
  }, [theme]);
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
  const runSharedLoad = useCallback(
    (shareId, token) => {
      loadSharedAnalysis(shareId, token)
        .then((data) => {
          dispatch({ type: "LOAD_SHARED_ANALYSIS", data });
          dispatch({ type: "CLEAR_SHARE_ERROR" });
          navigate("/dashboard", { replace: true });
        })
        .catch((err) => {
          dispatch({ type: "SET_SHARE_ERROR", error: classifyShareError(err) });
        });
    },
    [navigate, dispatch],
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shareId = params.get("share");
    if (!shareId) return;
    runSharedLoad(shareId);
  }, [location.search, runSharedLoad]);

  const handleShareRetry = useCallback(() => {
    dispatch({ type: "CLEAR_SHARE_ERROR" });
    const params = new URLSearchParams(location.search);
    const shareId = params.get("share");
    if (shareId) runSharedLoad(shareId);
  }, [location.search, runSharedLoad, dispatch]);

  const handleShareUnlock = useCallback(
    (token) => {
      dispatch({ type: "SET_GH_TOKEN", value: token });
      tokenManager.set(token);
      handleShareRetry();
    },
    [handleShareRetry, dispatch],
  );

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
    (url, tokenOverride) => {
      if (!url) return;
      cleanup();
      dispatch({ type: "START_ANALYSIS", url });
      // Ask for notification permission as part of a user gesture (analysis
      // start) instead of on page load — prompts on load hurt UX and the
      // Lighthouse best-practices score.
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
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
        const gh = tokenOverride || ghToken;
        ws.send(
          JSON.stringify({
            repo_url: url,
            session_id: SESSION_ID,
            ...(gh ? { gh_token: gh } : {}),
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
    async (user, tokenOverride) => {
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
        // Landing-page submissions can carry their own token (private
        // repos / higher rate limits) before the dashboard takes over.
        const list = await fetchRepos(u, tokenOverride || ghToken || null);
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

  // ── Apply a token from the landing page ───────────────────
  // Mirrors the dashboard CommandBar flow: update app state so the
  // analysis WS payload carries it, and persist for the session.
  const applyLandingToken = useCallback((token) => {
    const t = (token || "").trim();
    if (!t) return;
    dispatch({ type: "SET_GH_TOKEN", value: t });
    tokenManager.set(t);
  }, []);

  // ── Select + analyze ──────────────────────────────────────
  const handleSelectRepo = useCallback(
    (url, tokenOverride) => {
      dispatch({ type: "SET_SELECTED_REPO_URL", url });
      handleAnalyze(url, tokenOverride);
    },
    [handleAnalyze],
  );

  // ── Export ────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!analyzed) return;
    try {
      const { buildAnalysisPdf, downloadPdf, getCachedPdf, sanitizeFilename } =
        await import("./pdfBuilder");
      const cacheKey = `gm:${SESSION_ID}:analysis`;
      const cached = getCachedPdf(cacheKey);
      const docDef =
        cached ||
        buildAnalysisPdf({
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
      const safeName = sanitizeFilename(repoName);
      downloadPdf(docDef, `gitmind-${safeName}-${Date.now()}.pdf`, cacheKey);
      addToast({
        kind: "success",
        title: "Report exported",
        sub: `${safeName}.pdf`,
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
    const url = `${window.location.origin}/?share=${SESSION_ID}`;
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

  // ── Status text ───────────────────────────────────────────
  const statusClass = analyzed ? "done" : isAnalyzing ? "running" : "";
  const statusText = analyzed
    ? `Done · ${elapsedSec}s`
    : isAnalyzing
      ? `Analyzing · ${elapsedSec}s`
      : "Ready";

  const isLanding = location.pathname === "/";

  return (
    <div className="app">
      {isLanding ? (
        <LandingPage
          onLoad={(user, token) => {
            applyLandingToken(token);
            handleLoadRepos(user, token);
            navigate("/dashboard");
          }}
          onAnalyzeUrl={(url, token) => {
            applyLandingToken(token);
            handleSelectRepo(url, token);
            navigate("/dashboard");
          }}
        />
      ) : (
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="app-loading">
                <span className="spinner" />
              </div>
            }
          >
            <SceneManager style={{ position: "absolute", inset: 0, zIndex: 0 }}>
              {({ prefersReduced }) => (
                <DashboardScene prefersReduced={prefersReduced} />
              )}
            </SceneManager>
            <div style={{ position: "relative", zIndex: 1 }}>
              <DashboardLayout
                state={state}
                dispatch={dispatch}
                sessionId={SESSION_ID}
                usernameRef={usernameRef}
                handleLoadRepos={handleLoadRepos}
                handleSelectRepo={handleSelectRepo}
                handleAnalyze={handleAnalyze}
                handleShare={handleShare}
                handleExport={handleExport}
                handleFix={handleFix}
                handlePaletteAction={handlePaletteAction}
                statusClass={statusClass}
                statusText={statusText}
                dismissToast={dismissToast}
                toasts={toasts}
              />
            </div>
          </Suspense>
        </ErrorBoundary>
      )}

      {/* ── Global overlays (shared across routes) ─────────────── */}
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
          {shareError && (
            <ShareErrorOverlay
              error={shareError}
              onRetry={handleShareRetry}
              onUnlock={handleShareUnlock}
              onClose={() => dispatch({ type: "CLEAR_SHARE_ERROR" })}
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
            onClose={() =>
              dispatch({ type: "SET_FILE_PREVIEW", preview: null })
            }
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
      <PostProcessing enabled={!isLanding} />
      <ToastSystem toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
