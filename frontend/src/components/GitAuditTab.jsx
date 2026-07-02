import React, { useState, useMemo } from "react";
import {
  GitCommit,
  AlertTriangle,
  CheckCircle,
  Clock,
  ShieldAlert,
  FileWarning,
  ExternalLink,
} from "lucide-react";

const QUALITY_META = {
  good: {
    label: "Good",
    color: "var(--success)",
    icon: <CheckCircle size={11} strokeWidth={1.5} />,
  },
  warn: {
    label: "Vague",
    color: "var(--warning)",
    icon: <AlertTriangle size={11} strokeWidth={1.5} />,
  },
  bad: {
    label: "Poor",
    color: "var(--danger)",
    icon: <AlertTriangle size={11} strokeWidth={1.5} />,
  },
};

function StatPill({ label, value, color }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "10px 18px",
        background: "var(--surface-2)",
        borderRadius: 8,
        border: "1px solid var(--border)",
        minWidth: 80,
      }}
    >
      <span
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: color || "var(--text-1)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
        {label}
      </span>
    </div>
  );
}

function CommitRow({ commit }) {
  const [open, setOpen] = useState(false);
  const q = QUALITY_META[commit.msg_quality] || QUALITY_META.good;
  const date = commit.date
    ? new Date(commit.date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <div
      className="row"
      style={{ cursor: commit.body ? "pointer" : "default" }}
      onClick={() => commit.body && setOpen((o) => !o)}
    >
      <div className="row-line">
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            color: q.color,
            fontSize: 11,
            minWidth: 60,
            flexShrink: 0,
          }}
        >
          {q.icon} {q.label}
        </span>
        <div className="row-main">
          <span
            className="row-title"
            style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
          >
            {commit.sha}
          </span>
          <span className="row-sub">{commit.message || "(no message)"}</span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 2,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            {commit.author}
          </span>
          <span
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <Clock size={9} strokeWidth={1.5} /> {date}
          </span>
        </div>
        {commit.url && (
          <a
            href={commit.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--text-3)",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={12} strokeWidth={1.5} />
          </a>
        )}
      </div>
      {open && commit.body && (
        <div
          className="row-expand"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            color: "var(--text-2)",
          }}
        >
          {commit.body}
        </div>
      )}
    </div>
  );
}

function SecretRow({ finding }) {
  const sev = finding.severity || "high";
  return (
    <div className={`row ${sev}`}>
      <div className="row-line">
        <span className="row-sev">
          <span className="glyph" />
          {sev.toUpperCase()}
        </span>
        <div className="row-main">
          <span className="row-title">{finding.type}</span>
          <span className="row-sub">
            {finding.path}:{finding.line}
          </span>
        </div>
        <span
          className="row-path"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-3)",
            maxWidth: 200,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {finding.snippet}
        </span>
      </div>
    </div>
  );
}

function SensitiveFileRow({ item }) {
  return (
    <div className="row high">
      <div className="row-line">
        <span className="row-sev">
          <span className="glyph" />
          HIGH
        </span>
        <div className="row-main">
          <span className="row-title">{item.path}</span>
          <span className="row-sub">{item.reason}</span>
        </div>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="row-list">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="sk-row">
          <div className="sk-row-line">
            <span className="sk" style={{ height: 14, width: 52 }} />
            <div className="sk-stack">
              <span className="sk" style={{ height: 14, width: "40%" }} />
              <span className="sk" style={{ height: 12, width: "65%" }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function GitAuditTab({ audit, isAnalyzing, analyzed }) {
  const [section, setSection] = useState("commits");

  const stats = audit?.stats || {};
  const secrets = audit?.secret_findings || [];
  const senFiles = audit?.sensitive_files || [];
  const totalIssues = (stats.secrets_found || 0) + (stats.sensitive_files || 0);
  const hasIssues = totalIssues > 0;

  const filteredCommits = useMemo(() => {
    const c = audit?.commits || [];
    if (section === "bad") return c.filter((x) => x.msg_quality === "bad");
    if (section === "warn")
      return c.filter(
        (x) => x.msg_quality === "warn" || x.msg_quality === "bad",
      );
    return c;
  }, [audit?.commits, section]);

  if (!analyzed && !isAnalyzing) {
    return (
      <div className="empty">
        <GitCommit size={20} className="empty-icon" strokeWidth={1.5} />
        <div className="empty-title">Git Audit not available</div>
        <div className="empty-sub">Analyze a repository to get started</div>
      </div>
    );
  }

  if (isAnalyzing && !audit) return <SkeletonRows />;

  if (analyzed && !isAnalyzing && !audit) {
    return (
      <div className="empty">
        <GitCommit size={20} className="empty-icon" strokeWidth={1.5} />
        <div className="empty-title">No commit data available</div>
        <div className="empty-sub">
          Repository may be private or GitHub API rate-limited
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="tab-header">
        <div className="tab-header-main">
          <span className="tab-header-icon">
            <GitCommit size={15} strokeWidth={1.5} />
          </span>
          <div className="tab-header-text">
            <div className="tab-header-title">Git Audit</div>
            <div className="tab-header-sub">
              {stats.total || 0} commits · {totalIssues} issue
              {totalIssues !== 1 ? "s" : ""} found
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "flex",
          gap: 10,
          padding: "16px 20px",
          flexWrap: "wrap",
        }}
      >
        <StatPill label="Commits" value={stats.total || 0} />
        <StatPill
          label="Poor msgs"
          value={stats.bad_messages || 0}
          color={stats.bad_messages ? "var(--danger)" : undefined}
        />
        <StatPill
          label="Vague msgs"
          value={stats.warn_messages || 0}
          color={stats.warn_messages ? "var(--warning)" : undefined}
        />
        <StatPill
          label="Secrets"
          value={stats.secrets_found || 0}
          color={stats.secrets_found ? "var(--danger)" : undefined}
        />
        <StatPill
          label="Risky files"
          value={stats.sensitive_files || 0}
          color={stats.sensitive_files ? "var(--warning)" : undefined}
        />
      </div>

      {/* Section pills */}
      <div
        className="tab-header"
        style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}
      >
        <div className="sev-pills">
          {[
            { id: "commits", label: "All Commits", count: stats.total },
            { id: "bad", label: "Poor Only", count: stats.bad_messages },
            {
              id: "secrets",
              label: "Secrets",
              count: totalIssues,
              alert: hasIssues,
            },
          ].map(({ id, label, count, alert }) => (
            <button
              key={id}
              className={`sev-pill${section === id ? " active" : ""}${alert && section !== id ? " danger-pill" : ""}`}
              onClick={() => setSection(id)}
            >
              {alert && section !== id && (
                <AlertTriangle
                  size={10}
                  strokeWidth={2}
                  style={{ color: "var(--danger)" }}
                />
              )}
              {label}
              {count != null && <span className="count">{count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {section === "secrets" ? (
        <div className="row-list">
          {secrets.length === 0 && senFiles.length === 0 ? (
            <div className="empty" style={{ padding: "40px 32px" }}>
              <CheckCircle
                size={20}
                className="empty-icon"
                strokeWidth={1.5}
                style={{ color: "var(--success)" }}
              />
              <div className="empty-title">No secrets detected</div>
              <div className="empty-sub">
                No hardcoded credentials or sensitive files found
              </div>
            </div>
          ) : (
            <>
              {senFiles.length > 0 && (
                <>
                  <div
                    style={{
                      padding: "10px 20px 4px",
                      fontSize: 11,
                      color: "var(--text-3)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <FileWarning size={11} strokeWidth={1.5} /> SENSITIVE FILES
                    IN REPO
                  </div>
                  {senFiles.map((f, i) => (
                    <SensitiveFileRow key={i} item={f} />
                  ))}
                </>
              )}
              {secrets.length > 0 && (
                <>
                  <div
                    style={{
                      padding: "10px 20px 4px",
                      fontSize: 11,
                      color: "var(--text-3)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <ShieldAlert size={11} strokeWidth={1.5} /> HARDCODED
                    SECRETS IN CODE
                  </div>
                  {secrets.map((s, i) => (
                    <SecretRow key={i} finding={s} />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="row-list">
          {filteredCommits.length === 0 ? (
            <div className="empty" style={{ padding: "40px 32px" }}>
              <CheckCircle
                size={20}
                className="empty-icon"
                strokeWidth={1.5}
                style={{ color: "var(--success)" }}
              />
              <div className="empty-title">
                No {section === "bad" ? "poor" : ""} commits found
              </div>
            </div>
          ) : (
            filteredCommits.map((c) => (
              <CommitRow key={c.full_sha || c.sha} commit={c} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
