export const uiInitialState = {
  theme: localStorage.getItem("gm-theme") || "obsidian",
  density: localStorage.getItem("gm-density") || "comfortable",
  showOnboarding: true,
  showKbHelp: false,
  showPalette: false,
  filePreview: null,
  shareCopied: false,
  prAutoUrl: null,
  showOrgAudit: false,
  drawerOpen: false,
};

export function uiReducer(state, action) {
  switch (action.type) {
    case "SET_THEME": {
      const root = document.documentElement;
      if (action.theme === "obsidian") root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", action.theme);
      localStorage.setItem("gm-theme", action.theme);
      return { ...state, theme: action.theme };
    }
    case "SET_DENSITY": {
      const root = document.documentElement;
      if (action.density === "comfortable")
        root.removeAttribute("data-density");
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
    case "SET_PR_AUTO_URL":
      return { ...state, prAutoUrl: action.url };
    case "SET_SHOW_ORG_AUDIT":
      return { ...state, showOrgAudit: action.show };
    case "SET_DRAWER_OPEN":
      return { ...state, drawerOpen: action.open };
    default:
      return state;
  }
}
