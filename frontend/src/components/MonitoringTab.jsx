import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  ExternalLink,
  Trash2,
  RefreshCw,
  Bell,
  Clock,
  AlertTriangle,
  Plus,
  X,
} from "lucide-react";
import {
  subscribeMonitor,
  fetchMonitorStatus,
  unsubscribeMonitor,
} from "../api";
import * as tokenManager from "../tokenManager";

function relativeTime(ts) {
  if (!ts) return "never";
  const diff = Date.now() - ts * 1000;
  const m = Math.floor(diff / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatusBadge({ last_sha }) {
  if (!last_sha) {
    return <span className="mon-badge pending">Pending</span>;
  }
  return <span className="mon-badge active">Active</span>;
}

function EmptyState() {
  return (
    <div className="mon-empty">
      <Activity size={32} strokeWidth={1.2} style={{ opacity: 0.3 }} />
      <div className="mon-empty-title">No repos monitored yet</div>
      <div className="mon-empty-sub">
        Subscribe to a repo to receive automated security alerts and health
        tracking.
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div
      className="mon-row sk-row"
      style={{ borderRadius: 8, padding: "14px 16px" }}
    >
      <div className="sk-row-line">
        <span className="sk" style={{ height: 14, width: 120 }} />
        <span className="sk" style={{ height: 12, width: 60 }} />
      </div>
      <div className="sk-row-line" style={{ marginTop: 6 }}>
        <span className="sk" style={{ height: 10, width: 80 }} />
        <span className="sk" style={{ height: 10, width: 50 }} />
      </div>
    </div>
  );
}

export default function MonitoringTab({ ghToken, repoUrl, analyzed }) {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [subUrl, setSubUrl] = useState("");
  const [subSlack, setSubSlack] = useState("");
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState(null);

  const token = ghToken || tokenManager.get() || "";

  const fetchRepos = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchMonitorStatus(token || null)
      .then((data) => setRepos(data.repos || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  const handleSubscribe = async () => {
    const url = subUrl.trim();
    if (!url) {
      setSubError("Enter a GitHub repository URL.");
      return;
    }
    if (!url.includes("github.com/")) {
      setSubError("Only GitHub repositories are supported.");
      return;
    }
    setSubError(null);
    setSubLoading(true);
    try {
      const opts = {};
      if (subSlack.trim()) opts.slack_webhook_url = subSlack.trim();
      const data = await subscribeMonitor(url, opts, token || null);
      if (data.error) {
        setSubError(data.error);
      } else {
        setSubUrl("");
        setSubSlack("");
        setShowForm(false);
        fetchRepos();
      }
    } catch (err) {
      setSubError(err.message);
    } finally {
      setSubLoading(false);
    }
  };

  const handleUnsubscribe = async (monitorId) => {
    try {
      await unsubscribeMonitor(monitorId, token || null);
      setRepos((prev) => prev.filter((r) => r.id !== monitorId));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleQuickSubscribe = () => {
    if (repoUrl && analyzed) {
      setSubUrl(repoUrl);
      setShowForm(true);
    }
  };

  // Auto-fill form if repoUrl is provided and analyzed
  useEffect(() => {
    if (
      repoUrl &&
      analyzed &&
      !showForm &&
      !repos.find((r) => r.repo_url === repoUrl)
    ) {
      setSubUrl(repoUrl);
    }
  }, [repoUrl, analyzed, showForm, repos]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="monitor-tab">
      {/* Header */}
      <div
        className="tab-header"
        style={{ position: "static", marginBottom: 28 }}
      >
        <div className="tab-header-main">
          <span className="tab-header-icon">
            <Activity size={15} strokeWidth={1.5} />
          </span>
          <div className="tab-header-text">
            <div className="tab-header-title">Watch</div>
            <div className="tab-header-sub">
              Monitor repos for security changes and health regressions
            </div>
          </div>
        </div>
        <div className="tab-header-actions">
          <button
            className="btn-sm"
            onClick={() => fetchRepos()}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? "spin" : ""} />
          </button>
          {repoUrl &&
            analyzed &&
            !repos.find((r) => r.repo_url === repoUrl) && (
              <button className="btn-primary-sm" onClick={handleQuickSubscribe}>
                <Plus size={12} />
                Watch this repo
              </button>
            )}
        </div>
      </div>

      {/* Subscribe form */}
      {showForm && (
        <div className="mon-form">
          <div className="mon-form-row">
            <input
              className="mon-input"
              placeholder="https://github.com/owner/repo"
              value={subUrl}
              onChange={(e) => setSubUrl(e.target.value)}
              disabled={subLoading}
            />
            <button
              className="btn-primary-sm"
              onClick={handleSubscribe}
              disabled={subLoading}
            >
              {subLoading ? "Subscribing…" : "Subscribe"}
            </button>
            <button
              className="btn-sm"
              onClick={() => {
                setShowForm(false);
                setSubError(null);
              }}
              disabled={subLoading}
            >
              <X size={13} />
            </button>
          </div>
          <div className="mon-form-row" style={{ marginTop: 8 }}>
            <input
              className="mon-input"
              placeholder="Slack webhook URL (optional)"
              value={subSlack}
              onChange={(e) => setSubSlack(e.target.value)}
              disabled={subLoading}
            />
          </div>
          {subError && <div className="mon-error">{subError}</div>}
        </div>
      )}

      {/* Subscribe button (when form is hidden) */}
      {!showForm && (
        <div style={{ marginBottom: 20 }}>
          <button
            className="btn-primary-sm"
            onClick={() => {
              setShowForm(true);
              if (repoUrl && analyzed) setSubUrl(repoUrl);
            }}
          >
            <Plus size={12} />
            Subscribe to a repo
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && !loading && (
        <div className="mon-error" style={{ marginBottom: 16 }}>
          <AlertTriangle size={13} />
          {error}
          <button
            className="btn-sm"
            onClick={() => setError(null)}
            style={{ marginLeft: "auto" }}
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* Monitored repos list */}
      {loading ? (
        <div className="mon-list">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : repos.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mon-list">
          {repos.map((repo) => {
            const repoShort = repo.repo_url
              .replace("https://github.com/", "")
              .replace(/\.git$/, "");
            return (
              <div key={repo.id} className="mon-row">
                <div className="mon-row-main">
                  <div className="mon-row-top">
                    <a
                      href={repo.repo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mon-repo-name"
                    >
                      {repoShort}
                      <ExternalLink size={11} style={{ opacity: 0.5 }} />
                    </a>
                    <StatusBadge last_sha={repo.last_sha} />
                  </div>
                  <div className="mon-row-meta">
                    <span className="mon-meta-item">
                      <Clock size={10} />
                      Last check: {relativeTime(repo.last_check_at)}
                    </span>
                    {repo.slack_webhook_url && (
                      <span className="mon-meta-item">
                        <Bell size={10} />
                        Slack alerts
                      </span>
                    )}
                    {repo.last_session_id && (
                      <a
                        href={`/?share=${repo.last_session_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mon-meta-item mon-link"
                      >
                        View latest analysis →
                      </a>
                    )}
                  </div>
                </div>
                <button
                  className="btn-icon mon-unsub"
                  onClick={() => handleUnsubscribe(repo.id)}
                  title="Stop monitoring"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
