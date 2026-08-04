import * as tokenManager from "../tokenManager";

export const repoInitialState = {
  githubUser: "",
  ghToken: tokenManager.get() || "",
  repos: [],
  reposLoading: false,
  reposError: null,
  selectedRepoUrl: null,
  activeTab: "summary",
  repoName: "",
};

export function repoReducer(state, action) {
  switch (action.type) {
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
    default:
      return state;
  }
}
