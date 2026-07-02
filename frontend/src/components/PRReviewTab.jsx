import React, { useState, useEffect, useCallback } from "react";
import {
  GitPullRequest,
  ChevronDown,
  Check,
  AlertTriangle,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldAlert,
  Package,
  Zap,
  AlertCircle,
  GitMerge,
  XCircle,
  GitBranch,
} from "lucide-react";
import { reviewPR, prImpact, fetchOpenPRs } from "../api";
import * as tokenManager from "../tokenManager";

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const VERDICT_CLASS = {
  APPROVE: "approve",
  "REQUEST CHANGES": "changes",
  "NEEDS DISCUSSION": "discuss",
};

function parseReview(text) {
  const sections = { summary: "", issues: [], verdict: "", verdictLine: "" };
  const lines = text.split("\n");
  let current = null;
  for (const line of lines) {
    if (line.startsWith("## Summary")) {
      current = "summary";
      continue;
    }
    if (line.startsWith("## Issues")) {
      current = "issues";
      continue;
    }
    if (line.startsWith("## Verdict")) {
      current = "verdict";
      continue;
    }
    if (current === "summary")
      sections.summary += (sections.summary ? "\n" : "") + line;
    if (current === "issues") {
      const t = line.trim();
      if (!t) continue;
      if (t === "No significant issues found.") {
        sections.issues = [];
        current = null;
        continue;
      }
      const m = t.match(
        /^(.+?):(\d+)\s*[—–-]+\s*\[([A-Z]+)\]\s*(.+?)\s*[—–-]+\s*(.+)$/,
      );
      if (m)
        sections.issues.push({
          file: m[1],
          line: m[2],
          severity: m[3],
          title: m[4],
          explanation: m[5],
        });
      else sections.issues.push({ raw: t });
    }
    if (current === "verdict")
      sections.verdictLine += (sections.verdictLine ? "\n" : "") + line;
  }
  const vMatch = sections.verdictLine.match(
    /APPROVE|REQUEST CHANGES|NEEDS DISCUSSION/,
  );
  sections.verdict = vMatch ? vMatch[0] : "";
  return sections;
}

function IssueRow({ issue }) {
  const sev = issue.severity || "";
  const sevClass = sev.toLowerCase();
  if (issue.raw) {
    return (
      <div className={`row ${sevClass || "low"}`} style={{ cursor: "default" }}>
        <div className="row-line">
          <div className="row-main">
            <span className="row-sub">{issue.raw}</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`row ${sevClass || "low"}`} style={{ cursor: "default" }}>
      <div className="row-line">
        <span className="row-sev">
          <span className="glyph" />
          {sev || "INFO"}
        </span>
        <div className="row-main">
          <span className="row-title">{issue.title}</span>
          {issue.explanation && (
            <span className="row-sub">{issue.explanation}</span>
          )}
        </div>
        {issue.file && (
          <span className="row-path">
            {issue.file}:{issue.line}
          </span>
        )}
      </div>
    </div>
  );
}

const RISK_META = {
  low: {
    color: "var(--success)",
    bg: "rgba(34,197,94,0.10)",
    label: "Low Risk",
  },
  medium: {
    color: "var(--warning)",
    bg: "rgba(234,179,8,0.10)",
    label: "Medium Risk",
  },
  high: {
    color: "var(--danger)",
    bg: "rgba(239,68,68,0.10)",
    label: "High Risk",
  },
  critical: {
    color: "#a21caf",
    bg: "rgba(162,28,175,0.10)",
    label: "Critical",
  },
};

const REC_ICON = {
  "Safe to merge": <GitMerge size={13} strokeWidth={1.5} />,
  "Merge with caution": <AlertCircle size={13} strokeWidth={1.5} />,
  "Block — requires changes": <XCircle size={13} strokeWidth={1.5} />,
};

function ImpactPanel({ impact, loading, error }) {
  if (loading)
    return (
      <div style={{ marginTop: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="sk-row">
            <div className="sk-row-line">
              <span className="sk" style={{ height: 14, width: 60 }} />
              <span className="sk" style={{ height: 14, width: "60%" }} />
            </div>
          </div>
        ))}
      </div>
    );
  if (error)
    return (
      <div className="error-banner" style={{ marginTop: 12, borderRadius: 6 }}>
        <AlertTriangle size={13} strokeWidth={1.5} />
        <span>{error}</span>
      </div>
    );
  if (!impact) return null;

  const risk = (impact.merge_risk || "medium").toLowerCase();
  const riskMeta = RISK_META[risk] || RISK_META.medium;
  const delta = impact.health_delta ?? 0;
  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const deltaColor =
    delta > 0
      ? "var(--success)"
      : delta < 0
        ? "var(--danger)"
        : "var(--text-3)";
  const rec = impact.recommendation || "";

  return (
    <div
      style={{
        marginTop: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* ── Risk banner ───────────────────────────────────────────── */}
      <div
        style={{
          padding: "12px 16px",
          background: riskMeta.bg,
          border: `1px solid ${riskMeta.color}40`,
          borderRadius: 10,
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div
          style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".06em",
                color: riskMeta.color,
                padding: "2px 8px",
                background: `${riskMeta.color}20`,
                borderRadius: 4,
              }}
            >
              {riskMeta.label.toUpperCase()}
            </span>
            {impact.confidence && (
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                confidence: {impact.confidence}
              </span>
            )}
          </div>
          {impact.one_liner && (
            <div
              style={{
                fontSize: 13,
                color: "var(--text-1)",
                lineHeight: 1.5,
                marginTop: 2,
              }}
            >
              {impact.one_liner}
            </div>
          )}
        </div>
        {rec && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              color: riskMeta.color,
              whiteSpace: "nowrap",
              padding: "4px 10px",
              border: `1px solid ${riskMeta.color}40`,
              borderRadius: 6,
              flexShrink: 0,
            }}
          >
            {REC_ICON[rec] || <Zap size={13} strokeWidth={1.5} />}
            {rec}
          </div>
        )}
      </div>

      {/* ── Affected areas + breaking changes ─────────────────────── */}
      {(impact.affected_areas?.length > 0 ||
        impact.breaking_changes?.length > 0) && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {impact.affected_areas?.length > 0 && (
            <div style={{ flex: 1, minWidth: 160 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-3)",
                  marginBottom: 6,
                  letterSpacing: ".06em",
                }}
              >
                AFFECTED AREAS
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {impact.affected_areas.map((a) => (
                  <span
                    key={a}
                    style={{
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 4,
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      color: "var(--text-2)",
                    }}
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
          {impact.breaking_changes?.length > 0 && (
            <div style={{ flex: 1, minWidth: 160 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--danger)",
                  marginBottom: 6,
                  letterSpacing: ".06em",
                }}
              >
                BREAKING CHANGES
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {impact.breaking_changes.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 11,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 6,
                      color: "var(--text-1)",
                    }}
                  >
                    <XCircle
                      size={11}
                      strokeWidth={1.5}
                      style={{
                        color: "var(--danger)",
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    />
                    {c}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Narrative ─────────────────────────────────────────────── */}
      {impact.narrative && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--surface-2)",
            borderRadius: 8,
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              marginBottom: 8,
              letterSpacing: ".06em",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Zap size={10} strokeWidth={1.5} /> MERGE IMPACT ANALYSIS
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-2)",
              lineHeight: 1.75,
              whiteSpace: "pre-line",
            }}
          >
            {impact.narrative}
          </div>
        </div>
      )}

      {/* ── Numeric delta cards ────────────────────────────────────── */}
      <div
        style={{
          padding: "14px 16px",
          background: "var(--surface-2)",
          borderRadius: 8,
          border: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--text-3)",
            marginBottom: 10,
            letterSpacing: ".06em",
          }}
        >
          HEALTH DELTA · {impact.head_ref} ({impact.head_sha})
        </div>

        {impact.base_grade === "?" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "var(--warning)",
              padding: "6px 10px",
              background: "rgba(234,179,8,0.08)",
              borderRadius: 6,
              marginBottom: 10,
            }}
          >
            <AlertTriangle size={11} strokeWidth={1.5} />
            Base session has no health score — re-analyze the repo for an
            accurate delta
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 100,
              padding: "8px 12px",
              background: "var(--surface)",
              borderRadius: 7,
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 3 }}
            >
              BASE
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
              }}
            >
              {impact.base_score}
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                {" "}
                ({impact.base_grade})
              </span>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 100,
              padding: "8px 12px",
              background: "var(--surface)",
              borderRadius: 7,
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 3 }}
            >
              PR
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
              }}
            >
              {impact.pr_score}
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                {" "}
                ({impact.pr_grade})
              </span>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 100,
              padding: "8px 12px",
              background: "var(--surface)",
              borderRadius: 7,
              border: `1px solid ${deltaColor}40`,
            }}
          >
            <div
              style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 3 }}
            >
              DELTA
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                color: deltaColor,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <DeltaIcon size={16} strokeWidth={2} />
              {delta > 0 ? `+${delta}` : delta}
            </div>
          </div>
        </div>

        {/* Findings / CVE chips */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {impact.new_findings?.length > 0 && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                color: "var(--danger)",
                padding: "4px 9px",
                background: "rgba(239,68,68,0.08)",
                borderRadius: 5,
              }}
            >
              <ShieldAlert size={10} strokeWidth={1.5} />+
              {impact.new_findings.length} finding
              {impact.new_findings.length !== 1 ? "s" : ""}
            </span>
          )}
          {impact.fixed_findings?.length > 0 && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                color: "var(--success)",
                padding: "4px 9px",
                background: "rgba(34,197,94,0.08)",
                borderRadius: 5,
              }}
            >
              <Check size={10} strokeWidth={2} />
              {impact.fixed_findings.length} fixed
            </span>
          )}
          {impact.new_cves?.length > 0 && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                color: "var(--warning)",
                padding: "4px 9px",
                background: "rgba(234,179,8,0.08)",
                borderRadius: 5,
              }}
            >
              <Package size={10} strokeWidth={1.5} />+{impact.new_cves.length}{" "}
              CVE{impact.new_cves.length !== 1 ? "s" : ""}
            </span>
          )}
          {impact.fixed_cves?.length > 0 && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                color: "var(--success)",
                padding: "4px 9px",
                background: "rgba(34,197,94,0.08)",
                borderRadius: 5,
              }}
            >
              <Check size={10} strokeWidth={2} />
              {impact.fixed_cves.length} CVE
              {impact.fixed_cves.length !== 1 ? "s" : ""} resolved
            </span>
          )}
          {!impact.new_findings?.length &&
            !impact.fixed_findings?.length &&
            !impact.new_cves?.length &&
            !impact.fixed_cves?.length && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-3)",
                  padding: "4px 9px",
                }}
              >
                No security changes detected
              </span>
            )}
        </div>

        {/* Per-dimension breakdown */}
        {impact.breakdown_delta &&
          Object.values(impact.breakdown_delta).some((v) => v !== 0) && (
            <div
              style={{
                borderTop: "1px solid var(--border)",
                paddingTop: 10,
                marginTop: 10,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-3)",
                  marginBottom: 7,
                  letterSpacing: ".06em",
                }}
              >
                SCORE BREAKDOWN
              </div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {Object.entries(impact.breakdown_delta).map(
                  ([k, v]) =>
                    v !== 0 && (
                      <span
                        key={k}
                        style={{
                          fontSize: 11,
                          padding: "3px 8px",
                          borderRadius: 4,
                          background:
                            v > 0
                              ? "rgba(34,197,94,0.1)"
                              : "rgba(239,68,68,0.1)",
                          color: v > 0 ? "var(--success)" : "var(--danger)",
                        }}
                      >
                        {k.replace(/_/g, " ")}: {v > 0 ? `+${v}` : v}
                      </span>
                    ),
                )}
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

export default function PRReviewTab({
  prAutoUrl,
  onAutoUrlUsed,
  sessionId,
  analyzed,
  repoUrl,
}) {
  const [prUrl, setPrUrl] = useState("");
  const [token, setToken] = useState(() => tokenManager.get() || "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [impact, setImpact] = useState(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactError, setImpactError] = useState(null);
  const [openPRs, setOpenPRs] = useState([]);
  const [prsLoading, setPrsLoading] = useState(false);

  // Fetch open PRs whenever the repo changes and has been analyzed
  useEffect(() => {
    if (!repoUrl) return;
    const m = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!m) return;
    const owner = m[1];
    const repo = m[2].replace(/\.git$/, "");
    setOpenPRs([]);
    setPrsLoading(true);
    fetchOpenPRs(owner, repo, token || null)
      .then((data) => setOpenPRs(data.prs || []))
      .catch(() => setOpenPRs([]))
      .finally(() => setPrsLoading(false));
  }, [repoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire review + impact in parallel for a given PR URL
  const runAnalysis = useCallback(
    (url) => {
      setPrUrl(url);
      setError(null);
      setResult(null);
      setImpact(null);
      setImpactError(null);

      setLoading(true);
      reviewPR(url, token || undefined)
        .then((data) => setResult(data))
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));

      if (analyzed && sessionId) {
        setImpactLoading(true);
        prImpact(url, sessionId, token || null)
          .then((data) => setImpact(data))
          .catch((err) => setImpactError(err.message))
          .finally(() => setImpactLoading(false));
      }
    },
    [token, analyzed, sessionId],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill + trigger review when a PR URL is pasted anywhere in the app
  useEffect(() => {
    if (!prAutoUrl) return;
    onAutoUrlUsed?.();
    const t = setTimeout(() => runAnalysis(prAutoUrl), 120);
    return () => clearTimeout(t);
  }, [prAutoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReview = async () => {
    const url = prUrl.trim();
    if (!url) {
      setError("Enter a GitHub PR URL.");
      return;
    }
    runAnalysis(url);
  };

  const handleImpact = async () => {
    const url = prUrl.trim();
    if (!url) {
      setImpactError("Enter a GitHub PR URL first.");
      return;
    }
    if (!sessionId || !analyzed) {
      setImpactError("Analyze a repository first to use as the base.");
      return;
    }
    setImpactError(null);
    setImpact(null);
    setImpactLoading(true);
    try {
      const data = await prImpact(url, sessionId, token || null);
      setImpact(data);
    } catch (err) {
      setImpactError(err.message);
    } finally {
      setImpactLoading(false);
    }
  };

  const parsed = result?.review ? parseReview(result.review) : null;
  const verdictClass = parsed?.verdict ? VERDICT_CLASS[parsed.verdict] : "";

  return (
    <div className="pr-tab">
      {/* Tab header */}
      <div
        className="tab-header"
        style={{ position: "static", marginBottom: 28 }}
      >
        <div className="tab-header-main">
          <span className="tab-header-icon">
            <GitPullRequest size={15} strokeWidth={1.5} />
          </span>
          <div className="tab-header-text">
            <div className="tab-header-title">PR Review</div>
            <div className="tab-header-sub">
              AI-powered pull request analysis
            </div>
          </div>
        </div>
      </div>

      {/* Open PR picker — shown when repo is loaded */}
      {(prsLoading || openPRs.length > 0) && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              gap: 6,
              letterSpacing: ".05em",
            }}
          >
            <GitPullRequest size={11} strokeWidth={1.5} />
            OPEN PULL REQUESTS {!prsLoading && `(${openPRs.length})`}
          </div>
          {prsLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="sk-row"
                  style={{ borderRadius: 8, padding: "10px 14px", margin: 0 }}
                >
                  <div className="sk-row-line">
                    <span className="sk" style={{ height: 12, width: 34 }} />
                    <span className="sk" style={{ height: 12, width: "55%" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {openPRs.map((pr) => {
                const active = prUrl === pr.url;
                return (
                  <button
                    key={pr.number}
                    onClick={() => runAnalysis(pr.url)}
                    disabled={loading || impactLoading}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 8,
                      textAlign: "left",
                      cursor: "pointer",
                      background: active
                        ? "var(--primary)10"
                        : "var(--surface-2)",
                      border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                      transition: "border-color .15s, background .15s",
                    }}
                  >
                    {/* PR number */}
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        color: active ? "var(--primary)" : "var(--text-3)",
                        flexShrink: 0,
                        paddingTop: 1,
                      }}
                    >
                      #{pr.number}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Title */}
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--text-1)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          marginBottom: 4,
                        }}
                      >
                        {pr.draft && (
                          <span
                            style={{
                              fontSize: 11,
                              padding: "1px 5px",
                              borderRadius: 3,
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              color: "var(--text-3)",
                              marginRight: 6,
                            }}
                          >
                            DRAFT
                          </span>
                        )}
                        {pr.title}
                      </div>
                      {/* Meta row */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-3)",
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          <GitBranch size={10} strokeWidth={1.5} />
                          {pr.head_ref} → {pr.base_ref}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                          @{pr.user}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                          {relativeTime(pr.updated_at)}
                        </span>
                        {pr.labels?.map((l) => (
                          <span
                            key={l}
                            style={{
                              fontSize: 11,
                              padding: "1px 6px",
                              borderRadius: 3,
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              color: "var(--text-3)",
                            }}
                          >
                            {l}
                          </span>
                        ))}
                      </div>
                    </div>
                    {active && (loading || impactLoading) && (
                      <span className="spinner" style={{ flexShrink: 0 }} />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Manual input — always available as fallback */}
      <div
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          marginBottom: 6,
          letterSpacing: ".05em",
        }}
      >
        {openPRs.length > 0 ? "OR ENTER A PR URL MANUALLY" : "PULL REQUEST URL"}
      </div>
      <div className="pr-input">
        <input
          className="pr-url"
          placeholder="https://github.com/owner/repo/pull/123"
          value={prUrl}
          onChange={(e) => {
            setPrUrl(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && handleReview()}
        />
        <button
          className="btn btn-primary"
          onClick={handleReview}
          disabled={loading || !prUrl.trim()}
        >
          {loading ? (
            <>
              <span className="spinner" /> Reviewing…
            </>
          ) : (
            "Review PR"
          )}
        </button>
        {analyzed && (
          <button
            className="btn btn-ghost"
            onClick={handleImpact}
            disabled={impactLoading || !prUrl.trim()}
            title="Compare PR head branch against current analysis"
          >
            {impactLoading ? (
              <>
                <span className="spinner" /> Predicting…
              </>
            ) : (
              <>
                <TrendingUp size={13} strokeWidth={1.5} /> Predict Impact
              </>
            )}
          </button>
        )}
      </div>

      {/* Advanced toggle */}
      <button
        className="pr-advanced"
        onClick={() => setShowAdvanced((o) => !o)}
      >
        <ChevronDown
          size={12}
          strokeWidth={1.5}
          style={{
            transform: showAdvanced ? "none" : "rotate(-90deg)",
            transition: "transform 0.15s",
          }}
        />
        Advanced
      </button>

      {showAdvanced && (
        <input
          className="pr-token"
          type="password"
          placeholder="GitHub personal access token (optional)"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            tokenManager.set(e.target.value);
          }}
        />
      )}

      {error && (
        <div
          className="error-banner"
          style={{ marginBottom: 16, marginTop: 8, borderRadius: 6 }}
        >
          <AlertTriangle size={13} strokeWidth={1.5} />
          <span>{error}</span>
        </div>
      )}

      {/* Impact panel */}
      <ImpactPanel
        impact={impact}
        loading={impactLoading}
        error={impactError}
      />

      {/* Result */}
      {parsed && result && (
        <>
          <div className="pr-result">
            {/* PR Meta */}
            <div className="pr-meta">
              <div>
                <div className="key">REPOSITORY</div>
                <div className="val">{result.repo || "—"}</div>
              </div>
              <div>
                <div className="key">PR NUMBER</div>
                <div className="val mono">#{result.pr_num || "—"}</div>
              </div>
              {(result.additions != null || result.deletions != null) && (
                <div>
                  <div className="key">CHANGES</div>
                  <div className="val mono">
                    <span style={{ color: "var(--success)" }}>
                      +{result.additions || 0}
                    </span>
                    {" / "}
                    <span style={{ color: "var(--danger)" }}>
                      -{result.deletions || 0}
                    </span>
                  </div>
                </div>
              )}
              {result.changed_files != null && (
                <div>
                  <div className="key">FILES</div>
                  <div className="val">{result.changed_files} changed</div>
                </div>
              )}
            </div>

            {/* Summary + Verdict */}
            <div className="pr-summary">
              {parsed.summary && <p>{parsed.summary}</p>}

              {parsed.verdict && (
                <div className={`pr-verdict ${verdictClass}`}>
                  <div
                    className="pr-issues-header"
                    style={{ margin: "0 0 8px" }}
                  >
                    <span className="t-label">VERDICT</span>
                  </div>
                  <div className="verdict-line">
                    {verdictClass === "approve" && (
                      <Check size={24} strokeWidth={2} />
                    )}
                    {verdictClass === "changes" && (
                      <AlertTriangle size={24} strokeWidth={2} />
                    )}
                    {verdictClass === "discuss" && (
                      <MessageSquare size={24} strokeWidth={2} />
                    )}
                    {parsed.verdict}
                  </div>
                  {parsed.verdictLine &&
                    parsed.verdictLine !== parsed.verdict && (
                      <div className="verdict-just">
                        {parsed.verdictLine
                          .replace(parsed.verdict, "")
                          .replace(/[—–:]/g, "")
                          .trim()}
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>

          {/* Issues */}
          {parsed.issues.length > 0 && (
            <>
              <div className="pr-issues-header">
                <span className="t-label">ISSUES ({parsed.issues.length})</span>
              </div>
              <div className="row-list">
                {parsed.issues.map((issue, i) => (
                  <IssueRow key={i} issue={issue} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ marginTop: 24 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="sk-row">
              <div className="sk-row-line">
                <span className="sk" style={{ height: 14, width: 78 }} />
                <div className="sk-stack">
                  <span className="sk" style={{ height: 14, width: "60%" }} />
                  <span className="sk" style={{ height: 12, width: "80%" }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
