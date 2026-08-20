import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  MiniMap,
  Background,
} from "@xyflow/react";
import {
  GitBranch,
  ZoomOut,
  ZoomIn,
  Scan,
  Copy,
  Expand,
  Check,
  AlertTriangle,
} from "../icons";
import { fs } from "../typeScale";
import { parseMermaidToFlow } from "../utils/parseMermaid";
import { parseGraphJsonToFlow } from "../utils/parseGraphJson";
import { applyLayerLayout, sortByLayer } from "../utils/layerLayout";
import ArchNode from "./ArchNode";
import AnimatedEdge from "./AnimatedEdge";
import NodePanel from "./NodePanel";

import "@xyflow/react/dist/style.css";

const nodeTypes = { archNode: ArchNode };
const edgeTypes = { animatedEdge: AnimatedEdge };

/* Standard tab-header shell so Architecture matches every other dashboard
   tab. Children fill the remaining height via flex. */
function DiagramShell({ sub, children }) {
  return (
    <div className="diagram-tab">
      <div className="tab-header">
        <div className="tab-header-main">
          <span className="tab-header-icon">
            <GitBranch size={15} />
          </span>
          <div className="tab-header-text">
            <div className="tab-header-eyebrow">02 — Architecture</div>
            <div className="tab-header-title">Architecture</div>
            <div className="tab-header-sub">{sub}</div>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function humanizeNodeLabel(label, tier) {
  if (!label) return label;

  // Module X → tier name
  if (/^Module\s+[A-Z]$/.test(label)) {
    const tierMap = {
      frontend: "Frontend Layer",
      api: "API Layer",
      backend: "Backend Layer",
      database: "Database Layer",
      config: "Config Layer",
    };
    return tierMap[tier] || "Infrastructure Layer";
  }

  // Single letter IDs (A, B, C) → infer from tier
  if (/^[A-Z]$/.test(label)) {
    const tierMap = {
      frontend: "Frontend",
      api: "API Gateway",
      backend: "Backend Service",
      database: "Database",
      config: "Config",
    };
    return tierMap[tier] || "Module";
  }

  // ALL CAPS labels → title case
  if (/^[A-Z]{2,}$/.test(label)) {
    return label.charAt(0) + label.slice(1).toLowerCase();
  }

  // Underscore labels → title case
  if (label.includes("_")) {
    return label.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return label;
}

export default function DiagramTab({
  diagram,
  archGraph,
  isAnalyzing,
  theme,
  sessionId,
  enabled,
}) {
  const reactFlowWrapper = useRef(null);
  const reactFlowInstance = useRef(null);
  const rafRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [displayScale, setDisplayScale] = useState(100);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [parseError, setParseError] = useState(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const edgesRef = useRef(edges);
  useEffect(() => {
    edgesRef.current = edges;
  });

  // Single source of truth for "is there diagram input yet". Shared by the
  // render gates below AND the parse effect so the two can never disagree
  // (gate says render, effect clears nodes → blank canvas).
  // Prefer Mermaid when the JSON graph is too sparse (< 3 nodes) — the LLM
  // diagram is usually richer than the static AST parser output.
  const hasGraphInput = !!archGraph?.nodes?.length && archGraph.nodes.length >= 3;
  const hasMermaidInput =
    !!diagram && typeof diagram === "string" && diagram.startsWith("graph");

  useEffect(() => {
    try {
      setParseError(null);
      // Determine input type: rich JSON graph vs Mermaid string
      const hasGraph = hasGraphInput;
      const hasMermaid = hasMermaidInput;

      if (hasGraph) {
        const { nodes: parsedNodes, edges: parsedEdges } =
          parseGraphJsonToFlow(archGraph);
        const sorted = sortByLayer(parsedNodes);
        const laid = applyLayerLayout(sorted, parsedEdges);

        // Map raw nodes into custom styled archNode components
        const customizedNodes = laid.map((node) => {
          const lowerLabel = (node.data.label || "").toLowerCase();
          let tier = "config";
          let category = "Module";

          if (
            lowerLabel.includes("frontend") ||
            lowerLabel.includes("ui") ||
            lowerLabel.includes("view")
          ) {
            tier = "frontend";
            category = "UI Layer";
          } else if (
            lowerLabel.includes("backend") ||
            lowerLabel.includes("api") ||
            lowerLabel.includes("server")
          ) {
            tier = "backend";
            category = "Backend Services";
          }

          return {
            ...node,
            type: "archNode",
            data: {
              ...node.data,
              label: humanizeNodeLabel(
                node.data.label ||
                  node.id
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase()),
                node.data?.tier || tier,
              ),
              tier: node.data?.tier || tier,
              category: node.data?.category || category,
            },
          };
        });

        setNodes(customizedNodes);
        setEdges(parsedEdges);
      } else if (hasMermaid) {
        const { nodes: parsedNodes, edges: parsedEdges } =
          parseMermaidToFlow(diagram);

        const customizedNodes = parsedNodes.map((node) => {
          const lowerLabel = (node.label || "").toLowerCase();
          let tier = "config";
          let category = "Module";

          if (
            lowerLabel.includes("frontend") ||
            lowerLabel.includes("ui") ||
            lowerLabel.includes("view")
          ) {
            tier = "frontend";
            category = "UI Layer";
          } else if (
            lowerLabel.includes("backend") ||
            lowerLabel.includes("api") ||
            lowerLabel.includes("server")
          ) {
            tier = "backend";
            category = "Backend Services";
          }

          return {
            ...node,
            type: "archNode",
            data: {
              ...node.data,
              label: humanizeNodeLabel(
                node.label ||
                  node.id
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase()),
                node.data?.tier || tier,
              ),
              tier: node.data?.tier || tier,
              category: node.data?.category || category,
            },
          };
        });

        setNodes(customizedNodes);
        setEdges(parsedEdges);
      } else {
        setNodes([]);
        setEdges([]);
      }
    } catch (err) {
      console.error("[DiagramTab] Failed to parse diagram:", err);
      setParseError(err.message || "Failed to parse diagram");
      setNodes([]);
      setEdges([]);
    }
  }, [diagram, archGraph, hasGraphInput, hasMermaidInput, setNodes, setEdges]);

  useEffect(() => {
    if (!hoveredNode) {
      setNodes((nds) =>
        nds.map((n) => ({ ...n, data: { ...n.data, isDimmed: false } })),
      );
      setEdges((eds) =>
        eds.map((e) => ({ ...e, data: { ...e.data, isDimmed: false } })),
      );
      return;
    }
    const hoveredId = hoveredNode.id;
    const connectedEdgeIds = new Set();
    const connectedNodeIds = new Set([hoveredId]);
    edgesRef.current.forEach((e) => {
      if (e.source === hoveredId || e.target === hoveredId) {
        connectedEdgeIds.add(e.id);
        connectedNodeIds.add(e.source);
        connectedNodeIds.add(e.target);
      }
    });
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, isDimmed: !connectedNodeIds.has(n.id) },
      })),
    );
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        data: { ...e.data, isDimmed: !connectedEdgeIds.has(e.id) },
      })),
    );
  }, [hoveredNode, setNodes, setEdges]);

  useEffect(() => {
    if (!reactFlowInstance.current || nodes.length === 0) return;
    // The node panel changes the canvas width on open/close, so re-fit
    // once the canvas has re-measured after the layout shift.
    const id = setTimeout(() => {
      reactFlowInstance.current?.fitView({ padding: 0.2 });
    }, 80);
    return () => clearTimeout(id);
  }, [nodes.length, selectedNode]);

  const onMove = useCallback((_event, viewport) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setDisplayScale(Math.round(viewport.zoom * 100));
      rafRef.current = null;
    });
  }, []);

  const handleCopy = useCallback(async () => {
    if (!diagram) return;
    await navigator.clipboard.writeText(diagram);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [diagram]);

  const handleFullscreen = useCallback(() => {
    const el =
      reactFlowWrapper.current?.closest?.(".diagram-wrap") ??
      reactFlowWrapper.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onNodeMouseEnter = useCallback((_event, node) => {
    setHoveredNode(node);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

  const onNodeClick = useCallback((_event, node) => {
    setSelectedNode(node.data.label);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // ── Loading State ──
  // Both input forms count: the Mermaid string (diagram) and the rich JSON
  // graph (archGraph). Show the spinner until either arrives. Uses the same
  // validity predicate as the parser so a non-graph string (e.g. a
  // sequenceDiagram) still shows the spinner instead of a blank canvas.
  if (isAnalyzing && !hasMermaidInput && !hasGraphInput) {
    return (
      <DiagramShell sub="Generating diagram…">
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <div className="spinner" style={{ width: 32, height: 32 }} />
          <div style={{ fontSize: fs.md, color: "var(--text-3)" }}>
            Generating diagram…
          </div>
        </div>
      </DiagramShell>
    );
  }

  // ── Parse Error State ──
  if (parseError) {
    return (
      <DiagramShell sub="Diagram unavailable">
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "var(--danger-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AlertTriangle size={24} style={{ color: "var(--danger)" }} />
          </div>
          <div
            style={{
              fontSize: fs.base,
              fontWeight: 600,
              color: "var(--text-1)",
            }}
          >
            Diagram unavailable
          </div>
          <div
            style={{
              fontSize: fs.sm,
              color: "var(--text-3)",
              maxWidth: 320,
              textAlign: "center",
            }}
          >
            {parseError}
          </div>
        </div>
      </DiagramShell>
    );
  }

  // ── Empty State Panel (With layout alignments fixed) ──
  if (!hasMermaidInput && !hasGraphInput && !isAnalyzing) {
    return (
      <DiagramShell sub="System architecture">
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "var(--accent-dim)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 32px var(--accent-dim)",
            }}
          >
            <GitBranch size={24} style={{ color: "var(--accent)" }} />
          </div>
          <div
            style={{ fontSize: fs.lg, fontWeight: 600, color: "var(--text-1)" }}
          >
            Architecture not available
          </div>
          <div style={{ fontSize: fs.sm, color: "var(--text-3)" }}>
            Analyze a repository to generate the system diagram
          </div>
        </div>
      </DiagramShell>
    );
  }

  return (
    <DiagramShell sub="System architecture">
      <div
        className="diagram-wrap"
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          height: "auto",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Canvas Area Container — flex sibling of the node panel, so
              opening the panel narrows the graph instead of overlaying it. */}
          <div
            className="diagram-canvas"
            style={{ position: "relative", boxShadow: "none" }}
            ref={reactFlowWrapper}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={onNodeClick}
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseLeave={onNodeMouseLeave}
              onPaneClick={onPaneClick}
              onMove={onMove}
              onInit={(instance) => {
                reactFlowInstance.current = instance;
              }}
              nodesDraggable={true}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.1}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              style={{ background: "transparent" }}
            >
              <MiniMap
                zoomable
                pannable
                style={{
                  position: "absolute",
                  left: 16,
                  bottom: 16,
                  width: 150,
                  height: 100,
                  display: "block",
                  background: "var(--surface)",
                  border: "1px solid var(--border-m)",
                  borderRadius: 0,
                }}
                nodeColor={(n) => {
                  if (n.data?.tier === "frontend") return "var(--info)";
                  if (n.data?.tier === "backend") return "var(--accent)";
                  return "var(--text-3)";
                }}
                maskColor="var(--surface)"
              />
              <Background
                variant="lines"
                color="var(--border-s)"
                gap={24}
                lineWidth={1}
              />
            </ReactFlow>
          </div>

          {/* Node Drawer Panel */}
          {selectedNode && (
            <NodePanel
              node={selectedNode}
              sessionId={sessionId}
              enabled={enabled}
              onClose={() => setSelectedNode(null)}
            />
          )}

          {/* Centered Floating Control Dock — shifts left of the node
              panel when it opens so the controls stay reachable. */}
          <div
            className={`diagram-dock${selectedNode ? " diagram-dock--panel" : ""}`}
            style={{
              position: "absolute",
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              padding: "12px 8px",
              background: "var(--surface)",
              border: "1px solid var(--border-m)",
              borderRadius: 0,
              zIndex: 30,
              boxShadow: "3px 3px 0 var(--border-s)",
            }}
          >
            <span
              style={{
                fontSize: fs.micro,
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "var(--text-2)",
                userSelect: "none",
              }}
            >
              {displayScale}%
            </span>
            <div
              style={{
                width: 20,
                height: 1,
                background: "var(--border-m)",
              }}
            />
            <button
              onClick={() => reactFlowInstance.current?.zoomIn()}
              className="diagram-control-btn"
              title="Zoom In"
              aria-label="Zoom in"
            >
              <ZoomIn size={15} />
            </button>
            <button
              onClick={() => reactFlowInstance.current?.zoomOut()}
              className="diagram-control-btn"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut size={15} />
            </button>
            <div
              style={{
                width: 20,
                height: 1,
                background: "var(--border-s)",
              }}
            />
            <button
              onClick={() =>
                reactFlowInstance.current?.fitView({ padding: 0.2 })
              }
              className="diagram-control-btn"
              title="Recenter view"
              aria-label="Recenter view"
            >
              <Scan size={14} />
            </button>
            <button
              onClick={handleFullscreen}
              className="diagram-control-btn"
              title="Fullscreen mode"
              aria-label="Toggle fullscreen"
            >
              <Expand size={14} />
            </button>{" "}
            <button
              onClick={handleCopy}
              className={`diagram-control-btn${copied ? " diagram-control-btn-active" : ""}`}
              title={diagram ? "Copy diagram" : "No Mermaid source to copy"}
              aria-label={diagram ? "Copy diagram" : "Copy diagram unavailable"}
              disabled={!diagram}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </div>
    </DiagramShell>
  );
}
