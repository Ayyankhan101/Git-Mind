import React, { useState, useMemo } from "react";
import { FileCode2, Lock, LockOpen } from "../icons";
import { fs } from "../typeScale";

const METHODS = ["ALL", "GET", "POST", "PUT", "DELETE", "PATCH"];

function AuthBadge({ authRequired }) {
  if (authRequired === true)
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          fontSize: fs.micro,
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: "var(--warning)",
          background: "var(--warning-bg)",
          border: "1px solid var(--warning)",
          borderRadius: 4,
          padding: "1px 5px",
          flexShrink: 0,
        }}
      >
        <Lock size={9} /> AUTH
      </span>
    );
  if (authRequired === false)
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          fontSize: fs.micro,
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: "var(--text-3)",
          background: "var(--surface)",
          border: "1px solid var(--border-m)",
          borderRadius: 4,
          padding: "1px 5px",
          flexShrink: 0,
        }}
      >
        <LockOpen size={9} /> PUBLIC
      </span>
    );
  return null;
}

function Endpoint({ doc, onPickFile }) {
  const method = (doc.method || "GET").toUpperCase();
  const route = doc.path || doc.route || "—";
  const hasFile = doc.file;

  return (
    <div className="endpoint">
      <span className={`method ${method}`}>{method}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <div
            className="endpoint-route"
            onClick={() =>
              hasFile && onPickFile?.({ path: doc.file, line: doc.line })
            }
            onKeyDown={(e) => {
              if (hasFile && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onPickFile?.({ path: doc.file, line: doc.line });
              }
            }}
            role={hasFile ? "button" : undefined}
            tabIndex={hasFile ? 0 : undefined}
            title={hasFile ? "Preview file" : undefined}
          >
            {route}
          </div>
          <AuthBadge authRequired={doc.auth_required} />
        </div>
        {doc.description && (
          <div className="endpoint-desc">{doc.description}</div>
        )}
        {doc.parameters &&
          doc.parameters !== "None" &&
          doc.parameters !== "N/A" &&
          doc.parameters !== "none" && (
            <div className="endpoint-params">Parameters: {doc.parameters}</div>
          )}
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
              <span className="sk" style={{ height: 14, width: "50%" }} />
              <span className="sk" style={{ height: 12, width: "75%" }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DocsTab({ docs, isAnalyzing, analyzed, onPickFile }) {
  const [filter, setFilter] = useState("ALL");

  const filtered = useMemo(() => {
    if (!docs?.length) return [];
    if (filter === "ALL") return docs;
    return docs.filter((d) => (d.method || "").toUpperCase() === filter);
  }, [docs, filter]);

  const countFor = (m) =>
    m === "ALL"
      ? docs?.length || 0
      : docs?.filter((d) => (d.method || "").toUpperCase() === m).length || 0;

  if (!analyzed && !isAnalyzing) {
    return (
      <div className="empty">
        <FileCode2 size={20} className="empty-icon" />
        <div className="empty-title">API Docs not available</div>
        <div className="empty-sub">Analyze a repository to get started</div>
      </div>
    );
  }

  if (isAnalyzing && !docs?.length) return <SkeletonRows />;

  if (analyzed && !isAnalyzing && !docs?.length) {
    return (
      <div className="empty">
        <FileCode2 size={20} className="empty-icon" />
        <div className="empty-title">No API endpoints detected</div>
        <div className="empty-sub">
          No standard routing patterns found in this codebase
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Tab header */}
      <div className="tab-header">
        <div className="tab-header-main">
          <span className="tab-header-icon">
            <FileCode2 size={15} />
          </span>
          <div className="tab-header-text">
            <div className="tab-header-title">API Endpoints</div>
            <div className="tab-header-sub">
              {docs?.length || 0} endpoints discovered
            </div>
          </div>
        </div>
        <div className="tab-header-actions">
          {/* Method filter pills */}
          <div className="sev-pills">
            {METHODS.filter((m) => m === "ALL" || countFor(m) > 0).map((m) => (
              <button
                key={m}
                className={`sev-pill${filter === m ? ` active ${m}` : ""}`}
                onClick={() => setFilter(m)}
              >
                {m}
                {m !== "ALL" && <span className="count">{countFor(m)}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty" style={{ padding: "60px 32px" }}>
          <div className="empty-title">No {filter} endpoints</div>
        </div>
      ) : (
        filtered.map((doc, i) => (
          <Endpoint
            key={`${doc.method}-${doc.path || doc.route}-${i}`}
            doc={doc}
            onPickFile={onPickFile}
          />
        ))
      )}
    </div>
  );
}
