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

export const analysisInitialState = {
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

export function analysisReducer(state, action) {
  switch (action.type) {
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
      return { ...state, health: action.health, healthPartial: null };
    case "SET_HEALTH_PARTIAL":
      return { ...state, healthPartial: action.health };
    case "SET_AGENT_TIMING":
      return { ...state, agentTiming: action.timing };
    case "ADD_AGENT_WARNING":
      return {
        ...state,
        agentWarnings: [...state.agentWarnings, action.warning],
      };
    case "DISMISS_AGENT_WARNING":
      return {
        ...state,
        agentWarnings: state.agentWarnings.filter((_, i) => i !== action.index),
      };
    case "ANALYSIS_DONE":
      return {
        ...state,
        isAnalyzing: false,
        analyzed: true,
      };
    case "ANALYSIS_ERROR":
      return {
        ...state,
        globalError: action.error,
        retryUrl: action.retryUrl || state.selectedRepoUrl,
        isAnalyzing: false,
      };
    default:
      return state;
  }
}
