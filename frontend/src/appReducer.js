import { combineReducers } from "./reducers/combineReducers";
import { uiReducer, uiInitialState } from "./reducers/uiReducer";
import { repoReducer, repoInitialState } from "./reducers/repoReducer";
import {
  analysisReducer,
  analysisInitialState,
} from "./reducers/analysisReducer";
import { fixReducer, fixInitialState } from "./reducers/fixReducer";
import { listsReducer, listsInitialState } from "./reducers/listsReducer";

const errorInitialState = {
  globalError: null,
  retryUrl: null,
};

function errorReducer(state, action) {
  switch (action.type) {
    case "SET_GLOBAL_ERROR":
      return { ...state, globalError: action.error };
    case "CLEAR_ERROR":
      return { ...state, globalError: null, retryUrl: null };
    default:
      return state;
  }
}

export const initialState = {
  ...uiInitialState,
  ...repoInitialState,
  ...analysisInitialState,
  ...fixInitialState,
  ...errorInitialState,
  ...listsInitialState,
};

const _combined = combineReducers({
  ui: uiReducer,
  repo: repoReducer,
  analysis: analysisReducer,
  fix: fixReducer,
  error: errorReducer,
  lists: listsReducer,
});

// Flatten the combined state back to the original shape for backward compatibility
export function appReducer(state, action) {
  const sliced = _combined(
    {
      ui: {
        theme: state.theme,
        density: state.density,
        showOnboarding: state.showOnboarding,
        showKbHelp: state.showKbHelp,
        showPalette: state.showPalette,
        filePreview: state.filePreview,
        shareCopied: state.shareCopied,
        prAutoUrl: state.prAutoUrl,
        showOrgAudit: state.showOrgAudit,
        drawerOpen: state.drawerOpen,
      },
      repo: {
        githubUser: state.githubUser,
        ghToken: state.ghToken,
        repos: state.repos,
        reposLoading: state.reposLoading,
        reposError: state.reposError,
        selectedRepoUrl: state.selectedRepoUrl,
        activeTab: state.activeTab,
        repoName: state.repoName,
      },
      analysis: {
        isAnalyzing: state.isAnalyzing,
        analyzed: state.analyzed,
        agentStatus: state.agentStatus,
        elapsedSec: state.elapsedSec,
        diagram: state.diagram,
        archGraph: state.archGraph,
        apiDocs: state.apiDocs,
        findings: state.findings,
        cveFindings: state.cveFindings,
        gitAudit: state.gitAudit,
        solidityAudit: state.solidityAudit,
        codeAudit: state.codeAudit,
        health: state.health,
        agentWarnings: state.agentWarnings,
      },
      fix: {
        fixLoading: state.fixLoading,
        fixResult: state.fixResult,
        crisisFinding: state.crisisFinding,
      },
      error: { globalError: state.globalError, retryUrl: state.retryUrl },
      lists: {
        repoHistory: state.repoHistory,
        recents: state.recents,
        loadedUsers: state.loadedUsers,
      },
    },
    action,
  );

  // Handle LOAD_SHARED_ANALYSIS (cross-slice)
  if (action.type === "LOAD_SHARED_ANALYSIS") {
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
  }

  return {
    ...sliced.ui,
    ...sliced.repo,
    ...sliced.analysis,
    ...sliced.fix,
    ...sliced.error,
    ...sliced.lists,
  };
}
