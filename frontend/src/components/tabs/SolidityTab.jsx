import React, { useState } from "react";
import { ShieldAlert, Wrench } from "../../icons";
import { fs } from "../../typeScale";

const SEV_ORDER = ["critical", "high", "medium", "low"];

function FindingRow({ finding, onFix, fixLoading, fixResult }) {
  const [expanded, setExpanded] = useState(false);
  const sev = (finding.severity || "low").toLowerCase();
  const cardId = finding.id;
  const isFixing = fixLoading === cardId;
  const myFix = fixResult?.finding_id === cardId ? fixResult : null;

  return (
    <>
      <div
        className={`row ${sev}`}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={expanded}
      >
        <div className="row-line">
          <span className="row-sev">
            <span className="glyph" />
            {sev.toUpperCase()}
          </span>
          <span className="row-rule">{finding.title}</span>
          <span className="row-file">
            {finding.contract}
            {finding.function ? `.${finding.function}()` : ""}
          </span>
          <span className="row-id">{finding.swc || ""}</span>
        </div>
      </div>
      {expanded && (
        <div className="row-detail">
          <p>{finding.description}</p>
          <p style={{ color: "var(--text-2)", fontSize: fs.md, marginTop: 4 }}>
            {finding.remediation}
          </p>
          {onFix && (
            <div className="row-actions" style={{ marginTop: 8 }}>
              {!myFix && (
                <button
                  className="btn btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFix(finding);
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
                      fontSize: fs.md,
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

function ContractList({ contracts }) {
  const [open, setOpen] = useState(null);
  if (!contracts || contracts.length === 0) return null;

  return (
    <div className="sec-section">
      <h3 className="sec-title">Contracts</h3>
      {contracts.map((c, i) => (
        <div key={c.name + i} style={{ marginBottom: 8 }}>
          <button
            className="sec-section-header"
            onClick={() => setOpen((o) => (o === i ? null : i))}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              padding: "6px 0",
              background: "none",
              border: "none",
              color: "var(--text-1)",
              fontSize: fs.base,
              width: "100%",
              textAlign: "left",
            }}
          >
            <span style={{ flex: 1 }}>📄 {c.name}</span>
            <span style={{ color: "var(--text-3)", fontSize: fs.sm }}>
              {c.functions?.length || 0} fn · {c.state_variables?.length || 0}{" "}
              var
            </span>
          </button>
          {open === i && (
            <div
              style={{
                paddingLeft: 16,
                fontSize: fs.md,
                color: "var(--text-2)",
              }}
            >
              {c.functions?.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <strong>Functions:</strong>
                  {c.functions.map((f, j) => (
                    <div key={j} style={{ paddingLeft: 12, marginTop: 2 }}>
                      <span style={{ color: "var(--text-1)" }}>{f.name}</span>
                      <span style={{ color: "var(--text-3)", marginLeft: 6 }}>
                        ({f.visibility})
                      </span>
                      {f.modifiers?.length > 0 && (
                        <span style={{ color: "var(--accent)", marginLeft: 6 }}>
                          @{f.modifiers.join(", ")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {c.state_variables?.length > 0 && (
                <div>
                  <strong>State Variables:</strong>
                  {c.state_variables.map((v, j) => (
                    <div
                      key={j}
                      style={{
                        paddingLeft: 12,
                        marginTop: 2,
                        display: "flex",
                        gap: 6,
                      }}
                    >
                      <span>{v.typ}</span>
                      <span style={{ color: "var(--text-1)" }}>{v.name}</span>
                      <span style={{ color: "var(--text-3)" }}>
                        ({v.visibility})
                      </span>
                      {v.is_constant && (
                        <span style={{ color: "var(--warning)" }}>
                          constant
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {c.events?.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <strong>Events:</strong>
                  {c.events.map((e, j) => (
                    <div key={j} style={{ paddingLeft: 12, marginTop: 2 }}>
                      emit {e.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function SolidityTab({
  solAudit,
  isAnalyzing,
  onFix,
  fixLoading,
  fixResult,
}) {
  if (!solAudit && isAnalyzing) {
    return (
      <div className="tab-content-inner">
        <div className="skeleton-card" style={{ padding: 24 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="sk"
              style={{ height: 60, marginBottom: 8, borderRadius: 8 }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!solAudit) {
    return (
      <div className="tab-content-inner">
        <div className="empty-state">
          <ShieldAlert size={32} />
          <p>No Solidity (.sol) files found in this repository.</p>
        </div>
      </div>
    );
  }

  const { contracts = [], findings = [] } = solAudit;
  const sorted = [...findings].sort(
    (a, b) =>
      SEV_ORDER.indexOf(a.severity?.toLowerCase() || "low") -
      SEV_ORDER.indexOf(b.severity?.toLowerCase() || "low"),
  );

  const critical = sorted.filter((f) => f.severity === "critical");
  const high = sorted.filter((f) => f.severity === "high");

  return (
    <div className="tab-content-inner">
      <div className="tab-header">
        <div className="tab-header-main">
          <span className="tab-header-icon">
            <ShieldAlert size={15} />
          </span>
          <div className="tab-header-text">
            <div className="tab-header-eyebrow">07 — Solidity</div>
            <div className="tab-header-title">Solidity Audit</div>
            <div className="tab-header-sub">
              {sorted.length} finding{sorted.length !== 1 ? "s" : ""}
              {contracts.length > 0 &&
                ` · ${contracts.length} contract${contracts.length > 1 ? "s" : ""}`}
            </div>
          </div>
        </div>
      </div>

      {critical.length + high.length > 0 && (
        <div className="sec-section">
          <h3 className="sec-title">Critical & High Risk</h3>
          <div className="rows">
            {[...critical, ...high].map((f, i) => (
              <FindingRow
                key={f.id || i}
                finding={f}
                onFix={onFix}
                fixLoading={fixLoading}
                fixResult={fixResult}
              />
            ))}
          </div>
        </div>
      )}

      {sorted.filter((f) => f.severity !== "critical" && f.severity !== "high")
        .length > 0 && (
        <div className="sec-section">
          <h3 className="sec-title">Medium & Low</h3>
          <div className="rows">
            {sorted
              .filter((f) => f.severity !== "critical" && f.severity !== "high")
              .map((f, i) => (
                <FindingRow
                  key={f.id || i}
                  finding={f}
                  onFix={onFix}
                  fixLoading={fixLoading}
                  fixResult={fixResult}
                />
              ))}
          </div>
        </div>
      )}

      <ContractList contracts={contracts} />
    </div>
  );
}
