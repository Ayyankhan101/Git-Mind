import React, { useState } from "react";
import {
  X,
  Package,
  AlertTriangle,
  CheckCircle,
  Building2,
  ShieldAlert,
} from "lucide-react";
import { orgAudit } from "../api";

// Backend caps each org audit at 20 repos (fans out N× GitHub API calls).
const MAX_ORG_REPOS = 20;

function SeverityDot({ sev }) {
  const c =
    sev === "critical"
      ? "var(--danger)"
      : sev === "high"
        ? "#f97316"
        : sev === "medium"
          ? "var(--warning)"
          : "var(--text-3)";
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: c,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

function RepoRow({ repo }) {
  const [open, setOpen] = useState(false);
  const hasError = !!repo.error;
  const count = repo.cve_count || 0;
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 20px",
          cursor: count ? "pointer" : "default",
        }}
        onClick={() => count && setOpen((o) => !o)}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: 13,
            flex: 1,
            color: "var(--text-1)",
          }}
        >
          {repo.repo_name}
        </span>
        {hasError ? (
          <span style={{ fontSize: 11, color: "var(--danger)" }}>error</span>
        ) : count === 0 ? (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "var(--success)",
            }}
          >
            <CheckCircle size={11} strokeWidth={1.5} /> clean
          </span>
        ) : (
          <span
            style={{
              fontSize: 11,
              color: "var(--danger)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {count} CVE{count !== 1 ? "s" : ""}
          </span>
        )}
        {repo.dep_files_found?.length > 0 && (
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            {repo.dep_files_found.join(", ")}
          </span>
        )}
      </div>
      {open &&
        repo.cve_findings?.map((pkg, i) => (
          <div
            key={i}
            style={{
              padding: "6px 20px 6px 32px",
              background: "var(--surface-2)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <Package
                size={11}
                strokeWidth={1.5}
                style={{ color: "var(--text-3)" }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-2)",
                }}
              >
                {pkg.package} v{pkg.version}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                {pkg.ecosystem}
              </span>
            </div>
            {pkg.vulns?.map((v, j) => (
              <div
                key={j}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  color: "var(--text-3)",
                  marginLeft: 18,
                  marginBottom: 2,
                }}
              >
                <SeverityDot sev={v.severity} />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-2)",
                  }}
                >
                  {v.id}
                </span>
                <span>{v.summary?.slice(0, 80)}</span>
                {v.fixed_in && (
                  <span style={{ color: "var(--success)" }}>
                    → fix: {v.fixed_in}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

export default function OrgAuditModal({ repos, token, onClose }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const scanList = repos.slice(0, MAX_ORG_REPOS);
  const truncated = repos.length > MAX_ORG_REPOS;

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await orgAudit(
        scanList.map((r) => r.url || r),
        token,
      );
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const stats = result?.stats || {};
  const shared = result?.shared_cves || [];
  const repoRes = result?.repos || [];

  return (
    <div
      className="crisis-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="crisis-panel" style={{ maxWidth: 680 }}>
        {/* Header */}
        <div
          className="crisis-header"
          style={{
            background: "none",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Building2
              size={16}
              strokeWidth={1.5}
              style={{ color: "var(--accent)" }}
            />
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--text-1)",
                }}
              >
                Org-wide CVE Audit
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                {repos.length} repositories
              </div>
            </div>
          </div>
          <button
            className="btn-icon"
            style={{ position: "absolute", top: 16, right: 16 }}
            onClick={onClose}
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="crisis-body" style={{ padding: 0 }}>
          {!result && !loading && !error && (
            <div style={{ padding: "32px 24px", textAlign: "center" }}>
              <Package
                size={28}
                strokeWidth={1}
                style={{ color: "var(--text-3)", marginBottom: 12 }}
              />
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-2)",
                  marginBottom: 6,
                }}
              >
                Scan {scanList.length} repos for CVEs
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-3)",
                  marginBottom: 20,
                }}
              >
                Fetches dependency files via GitHub API (no clone). Identifies
                vulnerabilities shared across repos.
                {truncated &&
                  ` Limited to the first ${MAX_ORG_REPOS} of ${repos.length} repos.`}
              </div>
              <button className="btn btn-primary" onClick={run}>
                Run Org Audit
              </button>
            </div>
          )}

          {loading && (
            <div style={{ padding: "40px 24px", textAlign: "center" }}>
              <span
                className="spinner"
                style={{ width: 20, height: 20, marginBottom: 12 }}
              />
              <div style={{ fontSize: 13, color: "var(--text-3)" }}>
                Scanning {scanList.length} repositories…
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: "24px" }}>
              <div className="error-banner" style={{ borderRadius: 6 }}>
                <AlertTriangle size={13} strokeWidth={1.5} />
                <span>{error}</span>
              </div>
              <button
                className="btn btn-ghost"
                style={{ marginTop: 12 }}
                onClick={run}
              >
                Retry
              </button>
            </div>
          )}

          {result && (
            <>
              {/* Stats */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "16px 20px",
                  flexWrap: "wrap",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {[
                  {
                    label: "Repos",
                    value: stats.total_repos,
                    color: undefined,
                  },
                  {
                    label: "Total CVEs",
                    value: stats.total_cves,
                    color: stats.total_cves ? "var(--danger)" : undefined,
                  },
                  {
                    label: "Clean",
                    value: stats.repos_clean,
                    color: stats.repos_clean ? "var(--success)" : undefined,
                  },
                  {
                    label: "Shared CVEs",
                    value: stats.shared_count,
                    color: stats.shared_count ? "var(--warning)" : undefined,
                  },
                ].map(({ label, value, color }) => (
                  <div
                    key={label}
                    style={{
                      padding: "8px 14px",
                      background: "var(--surface-2)",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      minWidth: 80,
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        fontFamily: "var(--font-mono)",
                        color: color || "var(--text-1)",
                      }}
                    >
                      {value ?? 0}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-3)",
                        marginTop: 2,
                      }}
                    >
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Shared CVEs */}
              {shared.length > 0 && (
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
                    <ShieldAlert size={11} strokeWidth={1.5} /> CROSS-REPO
                    VULNERABILITIES
                  </div>
                  {shared.map((c, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px 20px",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                          color: "var(--danger)",
                          minWidth: 100,
                        }}
                      >
                        {c.cve_id}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--text-3)",
                          flex: 1,
                        }}
                      >
                        {c.repos.join(", ")}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 6px",
                          background: "rgba(239,68,68,0.1)",
                          borderRadius: 4,
                          color: "var(--danger)",
                        }}
                      >
                        {c.repo_count} repos
                      </span>
                    </div>
                  ))}
                </>
              )}

              {/* Per-repo results */}
              <div
                style={{
                  padding: "10px 20px 4px",
                  fontSize: 11,
                  color: "var(--text-3)",
                }}
              >
                PER REPOSITORY
              </div>
              {repoRes.map((r, i) => (
                <RepoRow key={i} repo={r} />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: 8,
          }}
        >
          {result && (
            <button className="btn btn-ghost" onClick={run} disabled={loading}>
              Re-scan
            </button>
          )}
          <button
            className="btn btn-ghost"
            style={{ marginLeft: "auto" }}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
