import React from "react";
import { GitPullRequest, GitBranch } from "../icons";
import { fs } from "../typeScale";
import { relativeTime } from "../utils/relativeTime";

export default function OpenPRsList({
  openPRs,
  prsLoading,
  prUrl,
  loading,
  impactLoading,
  onSelect,
}) {
  if (!prsLoading && openPRs.length === 0)
    return (
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: fs.xs,
            color: "var(--text-3)",
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
            letterSpacing: ".05em",
          }}
        >
          <GitPullRequest size={11} />
          OPEN PULL REQUESTS (0)
        </div>
        <div
          style={{ fontSize: fs.sm, color: "var(--text-3)", padding: "8px 0" }}
        >
          No open pull requests
        </div>
      </div>
    );

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: fs.xs,
          color: "var(--text-3)",
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
          letterSpacing: ".05em",
        }}
      >
        <GitPullRequest size={11} />
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
                onClick={() => onSelect(pr.url)}
                disabled={loading || impactLoading}
                aria-label={`PR #${pr.number}: ${pr.title}`}
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
                    ? "color-mix(in srgb, var(--primary) 10%, transparent)"
                    : "var(--surface-2)",
                  border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                  transition: "border-color .15s, background .15s",
                }}
              >
                <span
                  style={{
                    fontSize: fs.xs,
                    fontFamily: "var(--font-mono)",
                    color: active ? "var(--primary)" : "var(--text-3)",
                    flexShrink: 0,
                    paddingTop: 1,
                  }}
                >
                  #{pr.number}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: fs.md,
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
                          fontSize: fs.xs,
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
                        fontSize: fs.xs,
                        color: "var(--text-3)",
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <GitBranch size={10} />
                      {pr.head_ref} → {pr.base_ref}
                    </span>
                    <span style={{ fontSize: fs.xs, color: "var(--text-3)" }}>
                      @{pr.user}
                    </span>
                    <span style={{ fontSize: fs.xs, color: "var(--text-3)" }}>
                      {relativeTime(pr.updated_at)}
                    </span>
                    {pr.labels?.map((l) => (
                      <span
                        key={l}
                        style={{
                          fontSize: fs.xs,
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
  );
}
