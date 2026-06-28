import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  Suspense,
  lazy,
} from "react";
import {
  Search,
  FolderOpen,
  Share2,
  Download,
  Command,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  GitBranch,
  FileCode2,
  ShieldAlert,
  Lock,
  MessageSquare,
  Code2,
  BarChart3,
  GitPullRequest,
  GitCommit,
  Building2,
  Binary,
  Activity,
} from "lucide-react";

import { buildAnalysisPdf, downloadPdf } from "./pdfBuilder";

import Sidebar from "./components/Sidebar";
import DocsTab from "./components/DocsTab";
import SecurityTab from "./components/SecurityTab";
import ChatTab from "./components/ChatTab";
import SummaryTab from "./components/SummaryTab";
import CveTab from "./components/CveTab";
import PRReviewTab from "./components/PRReviewTab";
import CrisisChat from "./components/CrisisChat";
import Onboarding from "./components/Onboarding";
import KeyboardHelp from "./components/KeyboardHelp";
import FilePreviewDrawer from "./components/FilePreviewDrawer";
import ErrorBoundary from "./components/ErrorBoundary";
import GitAuditTab from "./components/GitAuditTab";
import SolidityTab from "./components/SolidityTab";
import CodeAuditTab from "./components/CodeAuditTab";
import MonitoringTab from "./components/MonitoringTab";
import OrgAuditModal from "./components/OrgAuditModal";
import CommandPalette from "./components/CommandPalette";
import ToastSystem from "./components/ToastSystem";
import {
  WS_BASE,
  fetchRepos,
  loadSharedAnalysis,
  generateFix,
  isValidGhToken,
} from "./api";
import { LANG_COLOR } from "./constants";
import * as tokenManager from "./tokenManager";

const DiagramTab = lazy(() => import("./components/DiagramTab"));

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
const AGENT_KEYS = [
  "scanner",
  "architecture",
  "api_docs",
  "security",
  "cve_scanner",
  "chat",
  "git_audit",
  "solidity",
  "code_audit",
];

const INITIAL_STATUS = {
  scanner: "waiting",
  architecture: "waiting",
  api_docs: "waiting",
  security: "waiting",
  cve_scanner: "waiting",
  chat: "waiting",
  git_audit: "waiting",
  solidity: "waiting",
  code_audit: "waiting",
};

const THEMES = [
  {
    id: "obsidian",
    name: "Obsidian",
    sub: "Default dark",
    colors: ["#09090b", "#7c6fe0"],
  },
  {
    id: "daylight",
    name: "Daylight",
    sub: "Light mode",
    colors: ["#fafafa", "#6366f1"],
  },
  {
    id: "amber",
    name: "Amber",
    sub: "Warm paper",
    colors: ["#1a1612", "#f59e0b"],
  },
  {
    id: "verdant",
    name: "Verdant",
    sub: "Forest dark",
    colors: ["#0a100d", "#10b981"],
  },
  {
    id: "glacier",
    name: "Glacier",
    sub: "Cool blue",
    colors: ["#0b1220", "#38bdf8"],
  },
  {
    id: "aurora",
    name: "Aurora",
    sub: "Glass violet",
    colors: ["#0a0a18", "#a78bfa"],
  },
  {
    id: "mist",
    name: "Mist",
    sub: "Light glass",
    colors: ["#eef1f8", "#6366f1"],
  },
];

function ThemeSwitcher({ theme, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  const current = THEMES.find((t) => t.id === theme) || THEMES[0];
  return (
    <div className="theme-switcher" ref={ref}>
      <button
        className="theme-btn"
        onClick={() => setOpen((o) => !o)}
        title="Change theme"
      >
        <span
          className="swatch"
          style={{
            background: `linear-gradient(135deg, ${current.colors[0]} 50%, ${current.colors[1]} 50%)`,
          }}
        />
        {current.name}
        <ChevronDown size={11} style={{ opacity: 0.6 }} />
      </button>
      {open && (
        <div className="theme-pop">
          {THEMES.map((t) => (
            <div
              key={t.id}
              className={`theme-opt${t.id === theme ? " active" : ""}`}
              onClick={() => {
                onChange(t.id);
                setOpen(false);
              }}
            >
              <div className="theme-opt-swatch">
                <span style={{ background: t.colors[0] }} />
                <span style={{ background: t.colors[1] }} />
              </div>
              <div>
                <div className="theme-opt-name">{t.name}</div>
                <div className="theme-opt-sub">{t.sub}</div>
              </div>
              {t.id === theme && (
                <Check size={13} className="theme-opt-check" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  // ── Theme & density ──────────────────────────────────────────────────────────
  const [theme, setTheme] = useState(
    () => localStorage.getItem("gm-theme") || "obsidian",
  );
  const [density, setDensity] = useState(
    () => localStorage.getItem("gm-density") || "comfortable",
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "obsidian") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    localStorage.setItem("gm-theme", theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (density === "comfortable") root.removeAttribute("data-density");
    else root.setAttribute("data-density", density);
    localStorage.setItem("gm-density", density);
  }, [density]);

  // ── Core state ───────────────────────────────────────────────────────────────
  const [githubUser, setGithubUser] = useState("");
  const [ghToken, setGhToken] = useState(() => tokenManager.get() || "");
  const [repos, setRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState(null);
  const [selectedRepoUrl, setSelectedRepoUrl] = useState(null);
  const [activeTab, setActiveTab] = useState("summary");
  const [agentStatus, setAgentStatus] = useState(INITIAL_STATUS);
  const [diagram, setDiagram] = useState(null);
  const [apiDocs, setApiDocs] = useState([]);
  const [findings, setFindings] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [globalError, setGlobalError] = useState(null);
  const [retryUrl, setRetryUrl] = useState(null);
  const [agentWarnings, setAgentWarnings] = useState([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [repoName, setRepoName] = useState("");
  const [crisisFinding, setCrisisFinding] = useState(null);
  const [cveFindings, setCveFindings] = useState([]);
  const [fixLoading, setFixLoading] = useState(null);
  const [fixResult, setFixResult] = useState(null);
  const [health, setHealth] = useState(null);
  const [gitAudit, setGitAudit] = useState(null);
  const [solidityAudit, setSolidityAudit] = useState(null);
  const [codeAudit, setCodeAudit] = useState(null);
  const [repoHistory, setRepoHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("gitmind_history") || "[]");
    } catch {
      return [];
    }
  });

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [showKbHelp, setShowKbHelp] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [filePreview, setFilePreview] = useState(null); // { path, line }
  const [toasts, setToasts] = useState([]);
  const [recents, setRecents] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("gm-recents") || "[]");
    } catch {
      return [];
    }
  });
  const [shareCopied, setShareCopied] = useState(false);
  const [prAutoUrl, setPrAutoUrl] = useState(null);
  const [showOrgAudit, setShowOrgAudit] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadedUsers, setLoadedUsers] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("gm-users") || "[]");
    } catch {
      return [];
    }
  });

  // ── Refs ──────────────────────────────────────────────────────────────────────
  const wsRef = useRef(null);
  const timerRef = useRef(null);
  const timeoutRef = useRef(null);
  const startRef = useRef(null);
  const analyzingRef = useRef(false);
  const usernameRef = useRef(null);
  const toastTimers = useRef({});

  // ── Toast helpers ─────────────────────────────────────────────────────────────
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

  // ── Recent commands ────────────────────────────────────────────────────────────
  const addRecent = useCallback((cmd) => {
    setRecents((prev) => {
      const next = [cmd, ...prev.filter((r) => r.id !== cmd.id)].slice(0, 5);
      try {
        localStorage.setItem("gm-recents", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // ── Restore persisted token ─────────────────────────────────────────────────
  useEffect(() => {
    tokenManager.restore().then((t) => {
      if (t) setGhToken(t);
    });
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────────
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

  // ── Load shared analysis ───────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get("share");
    if (!shareId) return;
    loadSharedAnalysis(shareId)
      .then((data) => {
        if (data.architecture_diagram) setDiagram(data.architecture_diagram);
        if (data.api_docs?.length) setApiDocs(data.api_docs);
        if (data.security_findings) setFindings(data.security_findings);
        if (data.cve_findings) setCveFindings(data.cve_findings);
        if (data.git_audit) setGitAudit(data.git_audit);
        if (data.repo_name) setRepoName(data.repo_name);
        if (data.health) setHealth(data.health);
        setAnalyzed(true);
        setShowOnboarding(false);
        setActiveTab("summary");
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notification permission ───────────────────────────────────────────────────
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // ── Global paste → PR auto-load ──────────────────────────────────────────────
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
        setPrAutoUrl(prMatch[0]);
        setActiveTab("pr");
        setShowOnboarding(false);
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

  // ── Analysis complete side-effects ────────────────────────────────────────────
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
    const entry = { url: selectedRepoUrl, name: repoName, ts: Date.now() };
    setRepoHistory((prev) => {
      const next = [
        entry,
        ...prev.filter((h) => h.url !== selectedRepoUrl),
      ].slice(0, 5);
      try {
        localStorage.setItem("gitmind_history", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [analyzed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Analyze ───────────────────────────────────────────────────────────────────
  const handleAnalyze = useCallback(
    (url) => {
      if (!url) return;
      cleanup();
      setGlobalError(null);
      setRetryUrl(null);
      setAgentWarnings([]);
      setDiagram(null);
      setApiDocs([]);
      setFindings([]);
      setCveFindings([]);
      setGitAudit(null);
      setSolidityAudit(null);
      setCodeAudit(null);
      setFixResult(null);
      setFixLoading(null);
      setHealth(null);
      setAnalyzed(false);
      setElapsedSec(0);
      setAgentStatus(INITIAL_STATUS);
      setRepoName(url.split("/").slice(-1)[0] || "repository");
      setIsAnalyzing(true);
      analyzingRef.current = true;
      setShowOnboarding(false);
      setActiveTab("summary");

      startRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);

      let ws;
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        setGlobalError(
          "WebSocket is not supported or the backend URL is misconfigured.",
        );
        setRetryUrl(url);
        setIsAnalyzing(false);
        cleanup();
        return;
      }
      wsRef.current = ws;

      const resetInactivityTimer = () => {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setGlobalError(
            "Analysis timed out — no response from backend for 3 minutes. Large repos may take longer; try again.",
          );
          setRetryUrl(url);
          setIsAnalyzing(false);
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
          setAgentStatus((prev) => ({ ...prev, ...data.agent_status }));
        if (data.architecture_diagram) setDiagram(data.architecture_diagram);
        if (data.api_docs?.length) setApiDocs(data.api_docs);
        if (data.security_findings) setFindings(data.security_findings);
        if (data.cve_findings) setCveFindings(data.cve_findings);
        if (data.git_audit) setGitAudit(data.git_audit);
        if (data.solidity_audit) setSolidityAudit(data.solidity_audit);
        if (data.code_audit) setCodeAudit(data.code_audit);
        if (data.health) setHealth(data.health);
        if (data.agent_error) {
          const ev = data.agent_error;
          setAgentWarnings((prev) => [
            ...prev,
            `${ev.agent} agent failed: ${ev.detail || "check backend logs"}`,
          ]);
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
          setIsAnalyzing(false);
          setAnalyzed(true);
          analyzingRef.current = false;
          ws.close();
        }
        if (data.error) {
          setGlobalError(`Backend error: ${data.error}`);
          setRetryUrl(url);
          clearInterval(timerRef.current);
          setIsAnalyzing(false);
          analyzingRef.current = false;
          ws.close();
        }
      };

      ws.onerror = () => {
        if (!analyzingRef.current) return;
        clearInterval(timerRef.current);
        setIsAnalyzing(false);
        analyzingRef.current = false;
        setGlobalError(
          "Cannot reach the backend on port 8002. Start it with:\n  cd backend && uvicorn main:app --port 8002 --reload",
        );
        setRetryUrl(url);
      };

      ws.onclose = (evt) => {
        if (!evt.wasClean && analyzingRef.current) {
          clearInterval(timerRef.current);
          setIsAnalyzing(false);
          analyzingRef.current = false;
          setGlobalError(
            "Connection dropped unexpectedly. Check the backend terminal for errors.",
          );
          setRetryUrl(url);
        }
      };
    },
    [cleanup, addToast, ghToken],
  );

  // ── Global keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const mod = IS_MAC ? e.metaKey : e.ctrlKey;
      if (showPalette) return; // palette handles its own keys

      if (
        e.key === "?" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)
      ) {
        e.preventDefault();
        setShowKbHelp((h) => !h);
      }
      if (mod && e.key === "k") {
        e.preventDefault();
        setShowPalette(true);
      }
      if (e.key === "Escape") {
        setShowKbHelp(false);
        setFilePreview(null);
        setGlobalError(null);
      }
      if (mod && e.key === "1") {
        e.preventDefault();
        setActiveTab("summary");
      }
      if (mod && e.key === "2") {
        e.preventDefault();
        setActiveTab("diagram");
      }
      if (mod && e.key === "3") {
        e.preventDefault();
        setActiveTab("docs");
      }
      if (mod && e.key === "4") {
        e.preventDefault();
        setActiveTab("security");
      }
      if (mod && e.key === "5") {
        e.preventDefault();
        setActiveTab("cve");
      }
      if (mod && e.key === "6") {
        e.preventDefault();
        setActiveTab("git");
      }
      if (mod && e.key === "7") {
        e.preventDefault();
        setActiveTab("solidity");
      }
      if (mod && e.key === "8") {
        e.preventDefault();
        setActiveTab("code_audit");
      }
      if (mod && e.key === "9") {
        e.preventDefault();
        setActiveTab("pr");
      }
      if (mod && e.key === "0") {
        e.preventDefault();
        setActiveTab("chat");
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
  }, [showPalette, analyzed, selectedRepoUrl, handleAnalyze]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load repos ────────────────────────────────────────────────────────────────
  const handleLoadRepos = useCallback(
    async (user) => {
      const u = (user || githubUser).trim();
      if (!u) {
        setReposError("Enter a GitHub username.");
        return;
      }
      setReposError(null);
      setReposLoading(true);
      setRepos([]);
      setShowOnboarding(false);
      addRecent({
        id: `user:${u}`,
        label: u,
        sub: "GitHub user",
        icon: "user",
      });
      try {
        const list = await fetchRepos(u, ghToken || null);
        setRepos(list);
        if (list.length === 0)
          setReposError(
            ghToken
              ? "No repositories found."
              : "No public repositories found.",
          );
        else {
          const hasPrivate = list.some((r) => r.private);
          addToast({
            kind: "info",
            title: `Loaded ${list.length} repos${hasPrivate ? " (incl. private)" : ""}`,
            sub: u,
          });
          setLoadedUsers((prev) => {
            const next = [u, ...prev.filter((x) => x !== u)].slice(0, 6);
            try {
              localStorage.setItem("gm-users", JSON.stringify(next));
            } catch {}
            return next;
          });
        }
      } catch (err) {
        setReposError(err.message);
        addToast({
          kind: "danger",
          title: "Failed to load repos",
          sub: err.message,
        });
      } finally {
        setReposLoading(false);
      }
    },
    [githubUser, ghToken, addToast, addRecent],
  );

  // ── Select + analyze ──────────────────────────────────────────────────────────
  const handleSelectRepo = useCallback(
    (url) => {
      setSelectedRepoUrl(url);
      handleAnalyze(url);
    },
    [handleAnalyze],
  );

  // ── Export ────────────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!analyzed) return;
    const docDef = buildAnalysisPdf({
      repoName,
      diagram,
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
    addRecent({
      id: "action:export",
      label: "Export report",
      sub: "Action",
      icon: "download",
    });
  }, [
    analyzed,
    repoName,
    diagram,
    apiDocs,
    findings,
    cveFindings,
    gitAudit,
    solidityAudit,
    codeAudit,
    health,
    elapsedSec,
    addToast,
    addRecent,
  ]);

  // ── Generate fix ──────────────────────────────────────────────────────────────
  const handleFix = useCallback(
    async (finding) => {
      setFixLoading(finding.id ?? finding.rule);
      setFixResult(null);
      try {
        const data = await generateFix(SESSION_ID, finding);
        setFixResult({ ...data, finding_id: finding.id ?? finding.rule });
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
        setFixLoading(null);
      }
    },
    [addToast],
  );

  // ── Share ─────────────────────────────────────────────────────────────────────
  const handleShare = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?share=${SESSION_ID}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
        addToast({
          kind: "success",
          title: "Link copied",
          sub: "Share URL in clipboard",
        });
        addRecent({
          id: "action:share",
          label: "Share analysis",
          sub: "Action",
          icon: "share",
        });
      })
      .catch(() => {
        window.prompt("Copy this link:", url);
      });
  }, [addToast, addRecent]);

  const clearPrAutoUrl = useCallback(() => setPrAutoUrl(null), []);

  // ── Palette action handler ─────────────────────────────────────────────────────
  const handlePaletteAction = useCallback(
    (action) => {
      setShowPalette(false);
      if (action.tab) {
        setActiveTab(action.tab);
        addRecent(action);
      }
      if (action.density) {
        setDensity(action.density);
        addRecent(action);
      }
      if (action.theme) {
        setTheme(action.theme);
        addRecent(action);
      }
      if (action.id === "action:share") handleShare();
      if (action.id === "action:export") handleExport();
      if (action.repo) {
        handleSelectRepo(action.repo.url);
        addRecent(action);
      }
      if (action.id === "action:kbhelp") setShowKbHelp(true);
    },
    [addRecent, handleShare, handleExport, handleSelectRepo],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tab metadata ──────────────────────────────────────────────────────────────
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

  // ── Status text ───────────────────────────────────────────────────────────────
  const statusClass = analyzed ? "done" : isAnalyzing ? "running" : "";
  const statusText = analyzed
    ? `Done · ${elapsedSec}s`
    : isAnalyzing
      ? `Analyzing · ${elapsedSec}s`
      : "Ready";

  const mod = IS_MAC ? "⌘" : "Ctrl";

  return (
    <div className="app">
      {/* ── Top bar (spans both columns) ─────────────────────────────────────── */}
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

        {/* Username input */}
        <div className="cb-input">
          <Search size={14} />
          <input
            ref={usernameRef}
            placeholder="github username"
            value={githubUser}
            onChange={(e) => {
              setGithubUser(e.target.value);
              setReposError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !reposLoading && !isAnalyzing)
                handleLoadRepos();
            }}
            disabled={isAnalyzing}
          />
        </div>

        {/* PAT input */}
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
            value={ghToken}
            onChange={(e) => {
              setGhToken(e.target.value);
              tokenManager.set(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !reposLoading && !isAnalyzing)
                handleLoadRepos();
            }}
            disabled={isAnalyzing}
            style={{ minWidth: 0 }}
          />
        </div>

        {/* Load button */}
        <button
          className="btn btn-ghost"
          onClick={() => handleLoadRepos()}
          disabled={reposLoading || isAnalyzing || !githubUser.trim()}
        >
          <FolderOpen size={13} />
          {reposLoading ? "Loading…" : "Load Repos"}
        </button>

        <span style={{ flex: 1 }} />

        {/* Status badge */}
        {(isAnalyzing || analyzed) && (
          <span className={`cb-status ${statusClass}`}>{statusText}</span>
        )}

        {/* Share */}
        <button
          className="btn-icon"
          onClick={handleShare}
          disabled={!analyzed}
          title="Share analysis"
        >
          {shareCopied ? (
            <Check size={14} style={{ color: "var(--success)" }} />
          ) : (
            <Share2 size={14} />
          )}
        </button>

        {/* Export */}
        <button
          className="btn-icon"
          onClick={handleExport}
          disabled={!analyzed}
          title="Export report"
        >
          <Download size={14} />
        </button>

        {/* Theme switcher */}
        <ThemeSwitcher theme={theme} onChange={setTheme} />
      </div>

      {/* ── Nav rail (col 1, row 2) ───────────────────────────────────────────── */}
      <nav className="nav-rail" role="navigation" aria-label="Main navigation">
        {/* Repos drawer toggle */}
        <button
          className={`nav-item${drawerOpen ? " active" : ""}`}
          onClick={() => setDrawerOpen((o) => !o)}
          data-tip="Repositories"
          aria-label="Repositories"
        >
          <FolderOpen size={18} strokeWidth={1.5} />
        </button>

        <div className="nav-divider" />

        {/* Tab navigation */}
        {tabs.map(({ key, Icon, label, count, alert }) => (
          <button
            key={key}
            className={`nav-item${activeTab === key ? " active" : ""}`}
            onClick={() => setActiveTab(key)}
            data-tip={label}
            aria-label={label}
            aria-current={activeTab === key ? "page" : undefined}
          >
            <Icon size={18} strokeWidth={1.5} />
            {count > 0 && (
              <span className={`nav-badge${alert ? " warn" : " info"}`}>
                {count > 99 ? "99+" : count}
              </span>
            )}
          </button>
        ))}

        {/* Agent status dots during analysis */}
        {(isAnalyzing || analyzed) && (
          <div className="nav-agents" title="Agent pipeline">
            {AGENT_KEYS.map((key) => (
              <div
                key={key}
                className={`nav-agent-dot ${agentStatus[key] || "waiting"}`}
              />
            ))}
          </div>
        )}

        <div className="nav-spacer" />

        {/* Bottom actions */}
        {repos.length > 0 && (
          <button
            className="nav-item"
            onClick={() => setShowOrgAudit(true)}
            data-tip="Org Audit"
            aria-label="Org Audit"
          >
            <Building2 size={18} strokeWidth={1.5} />
          </button>
        )}

        <button
          className="nav-item"
          onClick={() => setShowPalette(true)}
          data-tip={`${mod}+K`}
          aria-label="Command palette"
        >
          <Command size={18} strokeWidth={1.5} />
        </button>

        <button
          className="nav-item"
          onClick={() => setShowKbHelp(true)}
          data-tip="Shortcuts"
          aria-label="Keyboard shortcuts"
        >
          <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>
            ?
          </span>
        </button>
      </nav>

      {/* ── Main content (col 2, row 2) ──────────────────────────────────────── */}
      <div className="main">
        {/* Error banners */}
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
                  setGlobalError(null);
                  setRetryUrl(null);
                  handleAnalyze(retryUrl);
                }}
              >
                Retry
              </button>
            )}
            <button
              className="btn-icon"
              onClick={() => {
                setGlobalError(null);
                setRetryUrl(null);
              }}
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
              borderColor: "rgba(234,179,8,0.2)",
              background: "rgba(234,179,8,0.06)",
              color: "#fcd34d",
            }}
          >
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{w}</span>
            <button
              className="btn-icon"
              onClick={() =>
                setAgentWarnings((p) => p.filter((_, j) => j !== i))
              }
            >
              <X size={12} />
            </button>
          </div>
        ))}

        {/* Repo meta strip */}
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
                    background: LANG_COLOR[selectedRepo.language] || "#64748b",
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

        {/* Tab content — fills remaining space */}
        <div className="tab-content" role="tabpanel">
          {showOnboarding && !repos.length ? (
            <Onboarding
              onLoad={handleLoadRepos}
              onAnalyzeUrl={handleSelectRepo}
            />
          ) : (
            <ErrorBoundary key={activeTab}>
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
                  repoUrl={selectedRepoUrl}
                  ghToken={ghToken}
                />
              )}
              {activeTab === "diagram" && (
                <Suspense
                  fallback={<div className="tab-loading">Loading diagram…</div>}
                >
                  <DiagramTab
                    diagram={diagram}
                    isAnalyzing={isAnalyzing}
                    analyzed={analyzed}
                    theme={theme}
                    sessionId={SESSION_ID}
                    enabled={analyzed}
                    repoName={repoName}
                  />
                </Suspense>
              )}
              {activeTab === "docs" && (
                <DocsTab
                  docs={apiDocs}
                  isAnalyzing={isAnalyzing}
                  analyzed={analyzed}
                  onPickFile={setFilePreview}
                />
              )}
              {activeTab === "security" && (
                <SecurityTab
                  findings={findings}
                  isAnalyzing={isAnalyzing}
                  analyzed={analyzed}
                  onCrisis={setCrisisFinding}
                  onFix={handleFix}
                  fixLoading={fixLoading}
                  fixResult={fixResult}
                  onPickFile={setFilePreview}
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
                  onAutoUrlUsed={clearPrAutoUrl}
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
            </ErrorBoundary>
          )}
        </div>
      </div>

      {/* ── Repo drawer (slide-out from nav rail) ────────────────────────────── */}
      <div
        className={`repo-drawer${drawerOpen ? " open" : ""}`}
        aria-hidden={!drawerOpen}
      >
        <div className="drawer-close">
          <span className="drawer-close-title">Repositories</span>
          <button
            className="btn-icon"
            onClick={() => setDrawerOpen(false)}
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
            setDrawerOpen(false);
          }}
          selectedUrl={selectedRepoUrl}
          loading={reposLoading}
          error={reposError}
          history={repoHistory}
          onHistorySelect={(url) => {
            setSelectedRepoUrl(url);
            handleAnalyze(url);
            setDrawerOpen(false);
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

      {/* ── Overlays ──────────────────────────────────────────────────────────── */}
      {showOrgAudit && (
        <OrgAuditModal
          repos={repos}
          token={ghToken || null}
          onClose={() => setShowOrgAudit(false)}
        />
      )}
      {crisisFinding && (
        <CrisisChat
          finding={crisisFinding}
          sessionId={SESSION_ID}
          repoName={repoName}
          onClose={() => setCrisisFinding(null)}
        />
      )}
      <KeyboardHelp open={showKbHelp} onClose={() => setShowKbHelp(false)} />
      <FilePreviewDrawer
        path={filePreview?.path}
        line={filePreview?.line}
        repoUrl={selectedRepoUrl}
        ghToken={ghToken}
        onClose={() => setFilePreview(null)}
      />
      <CommandPalette
        open={showPalette}
        onClose={() => setShowPalette(false)}
        onAction={handlePaletteAction}
        repos={repos}
        recents={recents}
        theme={theme}
        density={density}
      />
      <ToastSystem toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
