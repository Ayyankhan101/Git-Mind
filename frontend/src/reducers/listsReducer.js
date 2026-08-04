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

export const listsInitialState = {
  repoHistory: getInitialHistory(),
  recents: getInitialRecents(),
  loadedUsers: getInitialLoadedUsers(),
};

export function listsReducer(state, action) {
  switch (action.type) {
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
    default:
      return state;
  }
}
