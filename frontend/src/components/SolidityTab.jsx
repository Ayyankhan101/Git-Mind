import React, { useState } from "react";
import { ShieldAlert, Wrench } from "lucide-react";

const SEV_ORDER = ["critical", "high", "medium", "low"];

function FindingRow({ finding, onFix, fixLoading, fixResult }) {
  const [expanded, setExpanded] = useState(false);
  const sev = (finding.severity || "low").toLowerCase();
  const cardId = finding.id;
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
          <p style={{ color: "var(--text-2)", fontSize: 13, marginTop: 4 }}>
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
              color: "var(--text)",
              fontSize: 14,
              width: "100%",
              textAlign: "left",
            }}
          >
            <span style={{ flex: 1 }}>📄 {c.name}</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>
              {c.functions?.length || 0} fn · {c.state_variables?.length || 0}{" "}
              var
            </span>
          </button>
          {open === i && (
            <div
              style={{ paddingLeft: 16, fontSize: 13, color: "var(--text-2)" }}
            >
              {c.functions?.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <strong>Functions:</strong>
                  {c.functions.map((f, j) => (
                    <div key={j} style={{ paddingLeft: 12, marginTop: 2 }}>
                      <span style={{ color: "var(--text)" }}>{f.name}</span>
                      <span style={{ color: "var(--text-3)", marginLeft: 6 }}>
                        ({f.visibility})
                      </span>
                      {f.modifiers?.length > 0 && (
                        <span
                          style={{ color: "var(--primary)", marginLeft: 6 }}
                        >
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
                      <span style={{ color: "var(--text)" }}>{v.name}</span>
                      <span style={{ color: "var(--text-3)" }}>
                        ({v.visibility})
                      </span>
                      {v.is_constant && (
                        <span style={{ color: "#f59e0b" }}>constant</span>
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
  onFix,
  fixLoading,
  fixResult,
}) {
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
      <div className="sec-header">
        <ShieldAlert size={16} />
        <span>Solidity Audit</span>
        <span className="sec-count">{sorted.length} findings</span>
        {contracts.length > 0 && (
          <span className="sec-count" style={{ opacity: 0.5 }}>
            {contracts.length} contract{contracts.length > 1 ? "s" : ""}
          </span>
        )}
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
