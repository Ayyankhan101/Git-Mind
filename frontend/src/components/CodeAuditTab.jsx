import React, { useState, useMemo } from "react";
import { Code, ExternalLink, Wrench } from "lucide-react";

const LANG_COLORS = {
  python: "#3572A5",
  javascript: "#f1e05a",
  typescript: "#3178c6",
  go: "#00ADD8",
  rust: "#dea584",
  java: "#b07219",
};

function FindingRow({ finding, onFix, fixLoading, fixResult }) {
  const [expanded, setExpanded] = useState(false);
  const sev = (finding.severity || "low").toLowerCase();
  const cardId =
    finding.id ?? finding.rule ?? `${finding.file}:${finding.line}`;
  const isFixing = fixLoading === cardId;
  const myFix = fixResult?.finding_id === cardId ? fixResult : null;

  return (
    <>
      <div className={`row ${sev}`} onClick={() => setExpanded((e) => !e)}>
        <div className="row-line">
          <span className="row-sev">
            <span className="glyph" />
            {sev.toUpperCase()}
          </span>
          <div className="row-main">
            <span className="row-title">{finding.title}</span>
            <span className="row-sub">
              {finding.file}
              {finding.line ? `:${finding.line}` : ""}
            </span>
          </div>
          <span className="row-path">
            {finding.rule && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-3)",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  padding: "1px 7px",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {finding.rule}
              </span>
            )}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="row-expand">
          <div className="scenario" style={{ fontStyle: "normal" }}>
            {finding.description}
          </div>
          {finding.remediation && (
            <div
              style={{
                marginTop: 8,
                padding: "8px 12px",
                borderRadius: 6,
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.2)",
                fontSize: 12,
                lineHeight: 1.5,
                color: "var(--success)",
              }}
            >
              {finding.remediation}
            </div>
          )}
          {finding.cwe && (
            <div style={{ marginTop: 6, fontSize: 11 }}>
              <a
                href={`https://cwe.mitre.org/data/definitions/${finding.cwe.replace("CWE-", "")}.html`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "var(--text-3)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <ExternalLink size={11} strokeWidth={1.5} /> {finding.cwe}
              </a>
            </div>
          )}
          {onFix && (
            <div className="row-actions" style={{ marginTop: 8 }}>
              {!myFix && (
                <button
                  className="btn btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFix({ ...finding, id: cardId });
                  }}
                  disabled={isFixing}
                >
                  <Wrench size={13} />
                  {isFixing ? "Generating…" : "Generate Fix"}
                </button>
              )}
              {myFix && (
                <div className="fix-result">
                  <p
                    style={{
                      color: "var(--success)",
                      fontSize: 13,
                      marginBottom: 4,
                    }}
                  >
                    Fix ready
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function LangSection({ langResult, onFix, fixLoading, fixResult }) {
  const { language, tool, findings, file_count } = langResult;
  const [langExpanded, setLangExpanded] = useState(true);
  const color = LANG_COLORS[language] || "#888";

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        onClick={() => setLangExpanded((e) => !e)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          padding: "10px 0",
          borderBottom: "1px solid var(--border)",
          userSelect: "none",
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
        <span
          style={{ fontWeight: 600, fontSize: 13, textTransform: "capitalize" }}
        >
          {language}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 4 }}>
          · {file_count} file{file_count !== 1 ? "s" : ""}· {findings.length}{" "}
          finding{findings.length !== 1 ? "s" : ""}
          {tool && ` · ${tool}`}
        </span>
        <span
          style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)" }}
        >
          {langExpanded ? "▲" : "▼"}
        </span>
      </div>

      {langExpanded && (
        <div className="row-list" style={{ marginTop: 4 }}>
          {findings.map((f, i) => (
            <FindingRow
              key={f.id || i}
              finding={f}
              onFix={onFix}
              fixLoading={fixLoading}
              fixResult={fixResult}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="row-list">
      {[0, 1, 2].map((i) => (
        <div key={i} className="sk-row">
          <div className="sk-row-line">
            <span className="sk" style={{ height: 14, width: 78 }} />
            <div className="sk-stack">
              <span className="sk" style={{ height: 14, width: "60%" }} />
              <span className="sk" style={{ height: 12, width: "40%" }} />
            </div>
            <span className="sk" style={{ height: 14, width: 60 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CodeAuditTab({
  codeAudit,
  isAnalyzing,
  analyzed,
  onFix,
  fixLoading,
  fixResult,
}) {
  const allFindings = useMemo(() => {
    if (!codeAudit?.length) return [];
    return codeAudit.flatMap((r) => r.findings || []);
  }, [codeAudit]);

  const totalFindings = allFindings.length;

  if (!analyzed && !isAnalyzing) {
    return (
      <div className="empty">
        <Code size={20} className="empty-icon" strokeWidth={1.5} />
        <div className="empty-title">Code Audit</div>
        <div className="empty-sub">
          Analyze a repository to see per-language code quality and security
          findings.
        </div>
      </div>
    );
  }

  if (isAnalyzing && !codeAudit?.length) return <SkeletonRows />;

  if (analyzed && !totalFindings) {
    return (
      <div className="empty">
        <Code size={20} className="empty-icon" strokeWidth={1.5} />
        <div className="empty-title">No issues found</div>
        <div className="empty-sub">
          No code quality or security issues detected across all languages.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="tab-header">
        <div className="tab-header-main">
          <span className="tab-header-icon">
            <Code size={15} strokeWidth={1.5} />
          </span>
          <div className="tab-header-text">
            <div className="tab-header-title">Code Audit</div>
            <div className="tab-header-sub">
              {totalFindings} finding{totalFindings !== 1 ? "s" : ""} across{" "}
              {codeAudit.length} language{codeAudit.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>
        {codeAudit.map((result, i) => (
          <LangSection
            key={result.language || i}
            langResult={result}
            onFix={onFix}
            fixLoading={fixLoading}
            fixResult={fixResult}
          />
        ))}
      </div>
    </div>
  );
}
