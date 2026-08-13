import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  memo,
} from "react";
import { FixedSizeList } from "react-window";
import {
  Star,
  Clock,
  Search,
  ChevronDown,
  FolderOpen,
  Filter,
  Bookmark,
  Lock,
  ExternalLink,
} from "../icons";
import { fs } from "../typeScale";
import AgentPipeline from "./AgentPipeline";
import { LANG_COLOR } from "../constants";

function fmtStars(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function byPushed(a, b) {
  return (
    new Date(b.pushed_at || b.updated_at) -
    new Date(a.pushed_at || a.updated_at)
  );
}

const SAVED_VIEWS = [
  { id: "all", label: "All Repos", filter: () => true },
  { id: "python", label: "Python", filter: (r) => r.language === "Python" },
  {
    id: "js",
    label: "JS / TS",
    filter: (r) => r.language === "JavaScript" || r.language === "TypeScript",
  },
  { id: "go", label: "Go", filter: (r) => r.language === "Go" },
  {
    id: "starred",
    label: "Top Starred",
    filter: (r) => (r.stars || 0) >= 100,
    sort: (a, b) => (b.stars || 0) - (a.stars || 0),
  },
];

const RepoCard = memo(function RepoCard({
  repo,
  selected,
  focused,
  onSelect,
  onHover,
  onLeave,
}) {
  const pushedAt =
    repo.pushed_at || repo.updated_at
      ? new Date(repo.pushed_at || repo.updated_at).toLocaleDateString(
          undefined,
          { month: "short", day: "numeric" },
        )
      : "";
  return (
    <div
      className={`repo-card${selected ? " selected" : ""}${focused ? " focused" : ""}`}
      onClick={() => onSelect(repo.url)}
      onMouseEnter={(e) => onHover(e, repo)}
      onMouseLeave={onLeave}
      tabIndex={0}
      role="option"
      aria-selected={selected}
    >
      <div className="repo-card-top">
        <span
          className="repo-name"
          style={{ display: "flex", alignItems: "center", gap: 4 }}
        >
          {repo.private && (
            <Lock size={10} style={{ color: "var(--text-3)", flexShrink: 0 }} />
          )}
          {repo.name}
        </span>
        {repo.stars > 0 && (
          <span className="repo-stars">
            <Star size={11} />
            {fmtStars(repo.stars)}
          </span>
        )}
        <button
          className="repo-card-gh"
          title="Open on GitHub"
          aria-label={`Open ${repo.name} on GitHub`}
          onClick={(e) => {
            e.stopPropagation();
            window.open(repo.url, "_blank", "noopener,noreferrer");
          }}
        >
          <ExternalLink size={11} />
        </button>
      </div>
      {repo.description && <div className="repo-desc">{repo.description}</div>}
      <div className="repo-meta">
        {repo.language && (
          <>
            <span
              className="lang-dot"
              style={{
                background: LANG_COLOR[repo.language] || "var(--text-3)",
              }}
            />
            <span>{repo.language}</span>
            <span>·</span>
          </>
        )}
        {pushedAt && <span>{pushedAt}</span>}
      </div>
    </div>
  );
});

const RepoRow = memo(function RepoRow({ index, style, data }) {
  const repo = data.items[index];
  return (
    <div style={style}>
      <RepoCard
        repo={repo}
        selected={data.selectedUrl === repo.url}
        focused={data.focusedIdx === index}
        onSelect={data.onSelect}
        onHover={data.onHover}
        onLeave={data.onLeave}
      />
    </div>
  );
});

function WorkspaceSwitcher({ currentUser, loadedUsers, onSwitch }) {
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

  return (
    <div className="workspace-switcher" ref={ref}>
      <button className="ws-btn" onClick={() => setOpen((o) => !o)}>
        <span className="ws-mark">{(currentUser || "G")[0].toUpperCase()}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ws-name">{currentUser || "GitMind"}</div>
          <div className="ws-meta">
            {currentUser ? "GitHub user" : "no user loaded"}
          </div>
        </div>
        <ChevronDown
          size={12}
          style={{
            color: "var(--text-3)",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        />
      </button>
      {open && loadedUsers.length > 1 && (
        <div className="ws-pop" role="listbox" aria-label="Switch workspace">
          {loadedUsers.map((u) => (
            <div
              key={u}
              className={`ws-opt${u === currentUser ? " active" : ""}`}
              onClick={() => {
                setOpen(false);
                if (u !== currentUser) onSwitch(u);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(false);
                  if (u !== currentUser) onSwitch(u);
                }
              }}
              tabIndex={0}
              role="option"
              aria-selected={u === currentUser}
            >
              <span
                className="ws-mark"
                style={{ width: 22, height: 22, fontSize: fs.xs }}
              >
                {u[0].toUpperCase()}
              </span>
              <span
                style={{
                  fontSize: fs.md,
                  color: "var(--text-1)",
                  fontWeight: 500,
                }}
              >
                {u}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  repos,
  onSelect,
  selectedUrl,
  loading,
  error,
  history,
  onHistorySelect,
  agentStatus,
  isAnalyzing,
  analyzed,
  elapsedSec,
  repoName,
  onLoadUser,
  currentUser,
  loadedUsers,
}) {
  const [filter, setFilter] = useState("");
  const [savedView, setSavedView] = useState("all");
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [repoSectionOpen, setRepoSectionOpen] = useState(true);
  const [historySectionOpen, setHistorySectionOpen] = useState(true);
  const [showSavedViews, setShowSavedViews] = useState(false);
  const [hoverRepo, setHoverRepo] = useState(null);
  const [hoverRect, setHoverRect] = useState(null);
  const filterRef = useRef(null);

  const view = SAVED_VIEWS.find((v) => v.id === savedView) || SAVED_VIEWS[0];

  const filtered = useMemo(
    () =>
      repos
        .filter((r) => view.filter(r))
        .filter(
          (r) => !filter || r.name.toLowerCase().includes(filter.toLowerCase()),
        )
        .sort(view.sort || byPushed),
    [repos, view, filter],
  );

  const handleRepoSelect = useCallback((url) => onSelect(url), [onSelect]);

  const handleRepoHover = useCallback((e, repo) => {
    setHoverRepo(repo);
    setHoverRect(e.currentTarget.getBoundingClientRect());
  }, []);

  const handleRepoLeave = useCallback(() => {
    setHoverRepo(null);
    setHoverRect(null);
  }, []);

  const repoItemData = useMemo(
    () => ({
      items: filtered,
      selectedUrl,
      focusedIdx,
      onSelect: handleRepoSelect,
      onHover: handleRepoHover,
      onLeave: handleRepoLeave,
    }),
    [
      filtered,
      selectedUrl,
      focusedIdx,
      handleRepoSelect,
      handleRepoHover,
      handleRepoLeave,
    ],
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (document.activeElement?.closest(".sidebar") === null) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIdx((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && focusedIdx >= 0 && filtered[focusedIdx]) {
        e.preventDefault();
        onSelect(filtered[focusedIdx].url);
      }
    },
    [filtered, focusedIdx, onSelect],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const safeLoadedUsers = loadedUsers || [];

  return (
    <aside className="sidebar">
      {/* Workspace switcher */}
      <div className="workspace">
        {currentUser || safeLoadedUsers.length > 0 ? (
          <WorkspaceSwitcher
            currentUser={currentUser}
            loadedUsers={safeLoadedUsers}
            onSwitch={onLoadUser}
          />
        ) : (
          <div className="logo">
            <span className="logo-mark">G</span>
            <span>GitMind</span>
          </div>
        )}
      </div>

      {error && (
        <div className="sidebar-error">
          {error}
        </div>
      )}

      <div className="sb-list">
        {/* Saved views toggle */}
        {repos.length > 0 && (
          <div style={{ borderBottom: "1px solid var(--border)" }}>
            <button
              className="sb-section-header"
              onClick={() => setShowSavedViews((o) => !o)}
              aria-expanded={showSavedViews}
            >
              <span
                className="t-label"
                style={{
                  fontSize: fs.xs,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Bookmark size={11} />
                SAVED VIEWS
              </span>
              <ChevronDown
                size={12}
                className="chevron"
                style={{
                  transform: showSavedViews ? "none" : "rotate(-90deg)",
                }}
              />
            </button>
            {showSavedViews && (
              <div className="saved-views-body">
                {SAVED_VIEWS.filter(
                  (v) => v.id === "all" || repos.some((r) => v.filter(r)),
                ).map((v) => {
                  const count =
                    v.id === "all"
                      ? repos.length
                      : repos.filter((r) => v.filter(r)).length;
                  return (
                    <div
                      key={v.id}
                      className={`saved-view${savedView === v.id ? " active" : ""}`}
                      onClick={() => {
                        setSavedView(v.id);
                        setFilter("");
                        setFocusedIdx(-1);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSavedView(v.id);
                          setFilter("");
                          setFocusedIdx(-1);
                        }
                      }}
                      tabIndex={0}
                      role="option"
                      aria-selected={savedView === v.id}
                    >
                      <Filter size={12} />
                      <span className="label">{v.label}</span>
                      <span className="count">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Recent history */}
        {history.length > 0 && (
          <div
            className={`sb-section${historySectionOpen ? "" : " collapsed"}`}
          >
            <button
              className="sb-section-header"
              onClick={() => setHistorySectionOpen((o) => !o)}
              aria-expanded={historySectionOpen}
            >
              <span className="t-label" style={{ fontSize: fs.xs }}>
                RECENT
              </span>
              <ChevronDown size={12} className="chevron" />
            </button>
            <div className="sb-section-body">
              {history.map((h) => (
                <div
                  key={h.url}
                  className={`repo-card${selectedUrl === h.url ? " selected" : ""}`}
                  onClick={() => onHistorySelect(h.url)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onHistorySelect(h.url);
                    }
                  }}
                  tabIndex={0}
                  role="option"
                  aria-selected={selectedUrl === h.url}
                  style={{ cursor: "pointer" }}
                >
                  <div className="repo-card-top">
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        color: "var(--text-2)",
                        fontSize: fs.md,
                      }}
                    >
                      <Clock size={11} style={{ color: "var(--text-3)" }} />
                      {h.name}
                    </span>
                  </div>
                  <div className="repo-meta sidebar-history-meta">
                    {new Date(h.ts).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Repo list */}
        {(loading || repos.length > 0) && (
          <div className={`sb-section${repoSectionOpen ? "" : " collapsed"}`}>
            <button
              className="sb-section-header"
              onClick={() => setRepoSectionOpen((o) => !o)}
              aria-expanded={repoSectionOpen}
            >
              <span className="t-label" style={{ fontSize: fs.xs }}>
                REPOSITORIES
                {repos.length
                  ? ` · ${filtered.length}${filtered.length !== repos.length ? `/${repos.length}` : ""}`
                  : ""}
              </span>
              <ChevronDown size={12} className="chevron" />
            </button>
            <div className="sb-section-body">
              {repos.length > 4 && (
                <div className="sb-filter">
                  <Search size={12} />
                  <input
                    ref={filterRef}
                    placeholder="Filter repos…"
                    value={filter}
                    onChange={(e) => {
                      setFilter(e.target.value);
                      setFocusedIdx(-1);
                    }}
                    aria-label="Filter repositories"
                  />
                </div>
              )}
              {loading && (
                <div style={{ padding: "16px 14px" }}>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="sk-row">
                      <div className="sk-row-line">
                        <span
                          className="sk"
                          style={{ height: 12, width: 80 }}
                        />
                        <div className="sk-stack">
                          <span
                            className="sk"
                            style={{ height: 12, width: "60%" }}
                          />
                          <span
                            className="sk"
                            style={{ height: 10, width: "85%" }}
                          />
                        </div>
                        <span
                          className="sk"
                          style={{ height: 12, width: 40 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {filtered.length > 20 ? (
                <FixedSizeList
                  height={Math.min(filtered.length * 72, 400)}
                  width="100%"
                  itemCount={filtered.length}
                  itemSize={72}
                  itemData={repoItemData}
                  style={{ overflowX: "hidden" }}
                >
                  {RepoRow}
                </FixedSizeList>
              ) : (
                filtered.map((repo, i) => (
                  <RepoCard
                    key={repo.url}
                    repo={repo}
                    selected={selectedUrl === repo.url}
                    focused={focusedIdx === i}
                    onSelect={handleRepoSelect}
                    onHover={handleRepoHover}
                    onLeave={handleRepoLeave}
                  />
                ))
              )}
              {!loading && repos.length > 0 && filtered.length === 0 && (
                <div
                  style={{
                    padding: "16px 14px",
                    fontSize: fs.sm,
                    color: "var(--text-3)",
                  }}
                >
                  No repos match "{filter}"
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && repos.length === 0 && history.length === 0 && (
          <div className="empty sidebar-empty">
            <FolderOpen size={18} className="empty-icon" />
            <div className="empty-title" style={{ fontSize: fs.md }}>
              No repositories
            </div>
            <div className="empty-sub">Enter a GitHub username above</div>
          </div>
        )}
      </div>

      <AgentPipeline
        status={agentStatus}
        isAnalyzing={isAnalyzing}
        analyzed={analyzed}
        elapsedSec={elapsedSec}
        repoName={repoName}
      />

      {hoverRepo && hoverRect && (
        <RepoHoverPreview repo={hoverRepo} anchorRect={hoverRect} />
      )}
    </aside>
  );
}

function RepoHoverPreview({ repo, anchorRect }) {
  const left = Math.min(window.innerWidth - 296, anchorRect.right + 12);
  const top = Math.max(16, Math.min(window.innerHeight - 220, anchorRect.top));
  return (
    <div
      className="repo-preview"
      style={{ left, top }}
      role="tooltip"
      aria-live="polite"
    >
      <div
        className="name"
        style={{ display: "flex", alignItems: "center", gap: 6 }}
      >
        {repo.private && <Lock size={11} style={{ color: "var(--text-3)" }} />}
        {repo.full_name || repo.name}
        {repo.private && (
          <span
            style={{
              fontSize: fs.xs,
              color: "var(--text-3)",
              background: "var(--surface-2)",
              padding: "1px 5px",
              borderRadius: 4,
            }}
          >
            private
          </span>
        )}
      </div>
      {repo.description && <div className="desc">{repo.description}</div>}
      <div className="row-stats">
        <span>
          <Star size={11} /> {repo.stars || 0}
        </span>
        {repo.language && (
          <span>
            <span
              className="lang-dot"
              style={{
                background: LANG_COLOR[repo.language] || "var(--text-3)",
              }}
            />
            {repo.language}
          </span>
        )}
        {(repo.pushed_at || repo.updated_at) && (
          <span>
            <Clock size={11} />
            {new Date(repo.pushed_at || repo.updated_at).toLocaleDateString(
              undefined,
              { month: "short", day: "numeric" },
            )}
          </span>
        )}
      </div>
    </div>
  );
}
