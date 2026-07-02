import React, { useState } from "react";
import {
  Search,
  GitBranch,
  FileCode2,
  ShieldAlert,
  Lock,
  Brain,
  GitCommit,
  ChevronDown,
} from "lucide-react";

const AGENTS = [
  { key: "scanner", label: "REPO SCANNER", Icon: Search },
  { key: "architecture", label: "ARCHITECTURE", Icon: GitBranch },
  { key: "api_docs", label: "API DOCS", Icon: FileCode2 },
  { key: "security", label: "SECURITY", Icon: ShieldAlert },
  { key: "cve_scanner", label: "CVE SCANNER", Icon: Lock },
  { key: "chat", label: "KNOWLEDGE", Icon: Brain },
  { key: "git_audit", label: "GIT AUDIT", Icon: GitCommit },
];

export default function AgentPipeline({
  status,
  isAnalyzing,
  analyzed,
  elapsedSec,
  repoName,
}) {
  const [expanded, setExpanded] = useState(true);

  const doneCount = Object.values(status || {}).filter(
    (s) => s === "done",
  ).length;
  const allDone = doneCount === 7;
  const mini = allDone && !expanded;

  const getRowStatus = (key) => {
    const s = status?.[key] || "waiting";
    if (s === "done") return "done";
    if (s === "running") return "running";
    if (
      isAnalyzing &&
      Object.values(status || {}).some((v) => v === "running" || v === "done")
    ) {
      const idx = AGENTS.findIndex((a) => a.key === key);
      const prevDone = AGENTS.slice(0, idx).every(
        (a) => status?.[a.key] === "done",
      );
      if (prevDone) return "running";
    }
    return "waiting";
  };

  const formatTime = (s) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <div className={`pipeline${mini ? " mini" : ""}`}>
      <div className="pipeline-header">
        <span className="t-label" style={{ fontSize: 11 }}>
          AGENTS · {doneCount}/7
        </span>
        {allDone && (
          <button
            className="pipeline-toggle"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? "collapse" : "expand"}
            <ChevronDown
              size={10}
              strokeWidth={1.5}
              style={{
                transform: expanded ? "none" : "rotate(-90deg)",
                transition: "transform 0.15s",
              }}
            />
          </button>
        )}
      </div>

      {mini && (
        <div className="pipeline-mini-summary">
          <span className="dot" />
          <span>{doneCount}/7 agents complete</span>
          <span className="mono">· {formatTime(elapsedSec)}</span>
        </div>
      )}

      {expanded &&
        AGENTS.map((agent, i) => {
          const rowStatus = getRowStatus(agent.key);
          const isFirst = i === 0;
          const isLast = i === AGENTS.length - 1;
          return (
            <div
              key={agent.key}
              className={`pipe-row ${rowStatus}`}
              style={
                isFirst
                  ? { "--connector-top": "50%" }
                  : isLast
                    ? { "--connector-bottom": "50%" }
                    : {}
              }
            >
              <span className="pipe-dot" />
              <span className="pipe-name">{agent.label}</span>
              <span className="pipe-time">
                {rowStatus === "done" && (
                  <>{elapsedSec > 0 ? `${Math.min(elapsedSec, 99)}s` : "✓"}</>
                )}
                {rowStatus === "running" && <span className="spinner" />}
              </span>
            </div>
          );
        })}
    </div>
  );
}
