import * as tokenManager from "./tokenManager";

// ── Initial state (merged from all reducers) ──────────────────────────────────

const getInitialHistory = () => {
  try {
    return JSON.parse(localStorage.getItem("gitmind_history") || "[]");
  } catch {
    return [];
  }
};

const getInitialRecents = () => {
  try {
    return JSON.parse(localStorage.getItem("gm-recents") || "[]");
  } catch {
    return [];
  }
};

const getInitialLoadedUsers = () => {
  try {
    return JSON.parse(localStorage.getItem("gm-users") || "[]");
  } catch {
    return [];
  }
};

const INITIAL_AGENT_STATUS = {
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

export const initialState = {
  // UI
  theme: localStorage.getItem("gm-theme") || "obsidian",
  density: localStorage.getItem("gm-density") || "comfortable",
  showOnboarding: true,
  showKbHelp: false,
  showPalette: false,
  filePreview: null,
  shareCopied: false,
  shareError: null,
  prAutoUrl: null,
  showOrgAudit: false,
  drawerOpen: false,
  // Repo
  githubUser: "",
  ghToken: tokenManager.get() || "",
  repos: [],
  reposLoading: false,
  reposError: null,
  selectedRepoUrl: null,
  activeTab: "summary",
  repoName: "",
  // Analysis
  isAnalyzing: false,
  analyzed: false,
  agentStatus: INITIAL_AGENT_STATUS,
  elapsedSec: 0,
  diagram: null,
  archGraph: null,
  apiDocs: [],
  findings: [],
  cveFindings: [],
  gitAudit: null,
  solidityAudit: null,
  codeAudit: null,
  health: null,
  agentWarnings: [],
  // Fix
  fixLoading: null,
  fixResult: null,
  crisisFinding: null,
  // Error
  globalError: null,
  retryUrl: null,
  // Lists
  repoHistory: getInitialHistory(),
  recents: getInitialRecents(),
  loadedUsers: getInitialLoadedUsers(),
};

// ── Flat reducer ──────────────────────────────────────────────────────────────

export function appReducer(state, action) {
  switch (action.type) {
    // ── UI ──────────────────────────────────────────────────────────────────
    case "SET_THEME": {
      localStorage.setItem("gm-theme", action.theme);
      import("./themeLoader").then(({ loadTheme }) => loadTheme(action.theme));
      return { ...state, theme: action.theme };
    }
    case "SET_DENSITY": {
      const root = document.documentElement;
      if (action.density === "comfortable") root.removeAttribute("data-density");
      else root.setAttribute("data-density", action.density);
      localStorage.setItem("gm-density", action.density);
      return { ...state, density: action.density };
    }
    case "SET_SHOW_ONBOARDING":
      return { ...state, showOnboarding: action.show };
    case "SET_SHOW_KB_HELP":
      return { ...state, showKbHelp: action.show };
    case "SET_SHOW_PALETTE":
      return { ...state, showPalette: action.show };
    case "SET_FILE_PREVIEW":
      return { ...state, filePreview: action.preview };
    case "SET_SHARE_COPIED":
      return { ...state, shareCopied: action.copied };
    case "SET_SHARE_ERROR":
      return { ...state, shareError: action.error };
    case "CLEAR_SHARE_ERROR":
      return { ...state, shareError: null };
    case "SET_PR_AUTO_URL":
      return { ...state, prAutoUrl: action.url };
    case "SET_SHOW_ORG_AUDIT":
      return { ...state, showOrgAudit: action.show };
    case "SET_DRAWER_OPEN":
      return { ...state, drawerOpen: action.open };

    // ── Repo ────────────────────────────────────────────────────────────────
    case "SET_GITHUB_USER":
      return { ...state, githubUser: action.value };
    case "SET_GH_TOKEN":
      return { ...state, ghToken: action.value };
    case "SET_SELECTED_REPO_URL":
      return { ...state, selectedRepoUrl: action.url };
    case "SET_ACTIVE_TAB":
      return { ...state, activeTab: action.tab };
    case "SET_REPOS":
      return { ...state, repos: action.repos };
    case "SET_REPOS_LOADING":
      return { ...state, reposLoading: action.loading };
    case "SET_REPOS_ERROR":
      return { ...state, reposError: action.error };
    case "SET_REPO_NAME":
      return { ...state, repoName: action.name };

    // ── Analysis ────────────────────────────────────────────────────────────
    case "START_ANALYSIS": {
      const name = action.url.split("/").slice(-1)[0] || "repository";
      return {
        ...state,
        globalError: null,
        retryUrl: null,
        agentWarnings: [],
        diagram: null,
        archGraph: null,
        apiDocs: [],
        findings: [],
        cveFindings: [],
        gitAudit: null,
        solidityAudit: null,
        codeAudit: null,
        fixResult: null,
        fixLoading: null,
        health: null,
        healthPartial: null,
        analyzed: false,
        elapsedSec: 0,
        agentStatus: INITIAL_AGENT_STATUS,
        agentTiming: null,
        repoName: name,
        isAnalyzing: true,
        showOnboarding: false,
        activeTab: "summary",
        selectedRepoUrl: action.url,
      };
    }
    case "SET_AGENT_STATUS":
      return {
        ...state,
        agentStatus: { ...state.agentStatus, ...action.status },
      };
    case "SET_ELAPSED_SEC":
      return { ...state, elapsedSec: action.sec };
    case "SET_DIAGRAM":
      return { ...state, diagram: action.diagram };
    case "SET_ARCH_GRAPH":
      return { ...state, archGraph: action.graph };
    case "SET_API_DOCS":
      return { ...state, apiDocs: action.docs };
    case "SET_FINDINGS":
      return { ...state, findings: action.findings };
    case "SET_CVE_FINDINGS":
      return { ...state, cveFindings: action.findings };
    case "SET_GIT_AUDIT":
      return { ...state, gitAudit: action.audit };
    case "SET_SOLIDITY_AUDIT":
      return { ...state, solidityAudit: action.audit };
    case "SET_CODE_AUDIT":
      return { ...state, codeAudit: action.audit };
    case "SET_HEALTH":
      return { ...state, health: action.health };
    case "SET_HEALTH_PARTIAL":
      return { ...state, healthPartial: action.health };
    case "SET_AGENT_WARNINGS":
      return { ...state, agentWarnings: action.warnings };
    case "SET_AGENT_TIMING":
      return { ...state, agentTiming: action.timing };
    case "SET_ANALYZED":
      return { ...state, analyzed: action.analyzed };
    case "RESET_ANALYSIS":
      return {
        ...state,
        isAnalyzing: false,
        analyzed: false,
        agentStatus: INITIAL_AGENT_STATUS,
        elapsedSec: 0,
        diagram: null,
        archGraph: null,
        apiDocs: [],
        findings: [],
        cveFindings: [],
        gitAudit: null,
        solidityAudit: null,
        codeAudit: null,
        health: null,
        agentWarnings: [],
      };

    // ── Fix ─────────────────────────────────────────────────────────────────
    case "SET_FIX_LOADING":
      return { ...state, fixLoading: action.id };
    case "SET_FIX_RESULT":
      return { ...state, fixResult: action.result };
    case "SET_CRISIS_FINDING":
      return { ...state, crisisFinding: action.finding };

    // ── Error ───────────────────────────────────────────────────────────────
    case "SET_GLOBAL_ERROR":
      return { ...state, globalError: action.error };
    case "CLEAR_ERROR":
      return { ...state, globalError: null, retryUrl: null };

    // ── Lists ───────────────────────────────────────────────────────────────
    case "ADD_TO_HISTORY": {
      const next = [
        action.entry,
        ...state.repoHistory.filter((h) => h.url !== action.entry.url),
      ].slice(0, 5);
      try {
        localStorage.setItem("gitmind_history", JSON.stringify(next));
      } catch {}
      return { ...state, repoHistory: next };
    }
    case "ADD_RECENT": {
      const next = [
        action.cmd,
        ...state.recents.filter((r) => r.id !== action.cmd.id),
      ].slice(0, 5);
      try {
        localStorage.setItem("gm-recents", JSON.stringify(next));
      } catch {}
      return { ...state, recents: next };
    }
    case "ADD_LOADED_USER": {
      const next = [
        action.user,
        ...state.loadedUsers.filter((x) => x !== action.user),
      ].slice(0, 6);
      try {
        localStorage.setItem("gm-users", JSON.stringify(next));
      } catch {}
      return { ...state, loadedUsers: next };
    }

    // ── Cross-slice ─────────────────────────────────────────────────────────
    case "LOAD_SHARED_ANALYSIS":
      return {
        ...state,
        diagram: action.data.architecture_diagram || state.diagram,
        archGraph: action.data.architecture_graph || state.archGraph,
        apiDocs: action.data.api_docs?.length
          ? action.data.api_docs
          : state.apiDocs,
        findings: action.data.security_findings || state.findings,
        cveFindings: action.data.cve_findings || state.cveFindings,
        gitAudit: action.data.git_audit || state.gitAudit,
        solidityAudit: action.data.solidity_audit || state.solidityAudit,
        codeAudit: action.data.code_audit || state.codeAudit,
        repoName: action.data.repo_name || state.repoName,
        health: action.data.health || state.health,
        analyzed: true,
        showOnboarding: false,
        activeTab: "summary",
      };

    default:
      return state;
  }
}
