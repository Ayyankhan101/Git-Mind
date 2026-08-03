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
} from "lucide-react";
import { parseMermaidToFlow } from "../utils/parseMermaid";
import { parseGraphJsonToFlow } from "../utils/parseGraphJson";
import { applyLayerLayout, sortByLayer } from "../utils/layerLayout";
import ArchNode from "./ArchNode";
import AnimatedEdge from "./AnimatedEdge";
import NodePanel from "./NodePanel";

import "@xyflow/react/dist/style.css";

const nodeTypes = { archNode: ArchNode };
const edgeTypes = { animatedEdge: AnimatedEdge };

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
    return label
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
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

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const edgesRef = useRef(edges);
  useEffect(() => {
    edgesRef.current = edges;
  });

  useEffect(() => {
    // Determine input type: rich JSON graph vs Mermaid string
    const hasGraph = archGraph && archGraph.nodes && archGraph.nodes.length > 0;
    const hasMermaid =
      diagram && typeof diagram === "string" && diagram.startsWith("graph");

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
  }, [diagram, archGraph, setNodes, setEdges]);

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
    if (nodes.length > 0 && reactFlowInstance.current) {
      reactFlowInstance.current.fitView({ padding: 0.2 });
    }
  }, [nodes.length]);

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

  // ── Empty State Panel (With layout alignments fixed) ──
  if (!diagram && !isAnalyzing) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "calc(100vh - 104px)",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "rgba(168,85,247,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 32px rgba(168,85,247,0.2)",
          }}
        >
          <GitBranch
            size={24}
            style={{ color: "var(--primary)" }}
            strokeWidth={1.5}
          />
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-1)" }}>
          Architecture not available
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>
          Analyze a repository to generate the system diagram
        </div>
      </div>
    );
  }

  return (
    <div
      className="diagram-wrap"
      style={{
        position: "relative",
        width: "100%",
        height: "calc(100vh - 104px)",
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
        {/* Canvas Area Container */}
        <div
          className="diagram-canvas"
          style={{
            width: "100%",
            height: "100%",
            position: "relative",
            boxShadow: "none",
          }}
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
                border: "1px solid var(--border)",
                borderRadius: 12,
              }}
              nodeColor={(n) => {
                if (n.data?.tier === "frontend") return "var(--info)";
                if (n.data?.tier === "backend") return "var(--primary)";
                return "var(--text-3)";
              }}
              maskColor="var(--surface-2)"
            />
            <Background color="rgba(255,255,255,0.02)" gap={24} size={1} />
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

        {/* Centered Floating Control Dock */}
        <div
          style={{
            position: "absolute",
            right: 16,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            padding: "12px 8px",
            background: "var(--surface)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            zIndex: 30,
            boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.5)",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontFamily: "monospace",
              fontWeight: 700,
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
              background: "var(--border)",
            }}
          />

          <button
            onClick={() => reactFlowInstance.current?.zoomIn()}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "var(--text-3)",
              cursor: "pointer",
            }}
            title="Zoom In"
          >
            <ZoomIn size={15} />
          </button>

          <button
            onClick={() => reactFlowInstance.current?.zoomOut()}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "var(--text-3)",
              cursor: "pointer",
            }}
            title="Zoom Out"
          >
            <ZoomOut size={15} />
          </button>

          <div
            style={{
              width: 20,
              height: 1,
              background: "rgba(255,255,255,0.1)",
            }}
          />

          <button
            onClick={() => reactFlowInstance.current?.fitView({ padding: 0.2 })}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "var(--text-3)",
              cursor: "pointer",
            }}
            title="Recenter View"
          >
            <Scan size={14} />
          </button>

          <button
            onClick={handleFullscreen}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "var(--text-3)",
              cursor: "pointer",
            }}
            title="Fullscreen Mode"
          >
            <Expand size={14} />
          </button>

          <button
            onClick={handleCopy}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "var(--text-3)",
              cursor: "pointer",
            }}
            title="Copy Diagram Content"
          >
            {copied ? (
              <Check size={14} style={{ color: "var(--success)" }} />
            ) : (
              <Copy size={14} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
