import React, { useEffect, useRef, useState, useCallback } from "react";
import mermaid from "mermaid";
import {
  GitBranch,
  ZoomOut,
  ZoomIn,
  Maximize2,
  AlertTriangle,
  Scan,
  Copy,
  Expand,
  Check,
} from "lucide-react";
import NodePanel from "./NodePanel";

const LIGHT_THEMES = new Set(["daylight", "mist"]);

function getMermaidConfig(theme) {
  const isLight = LIGHT_THEMES.has(theme);
  const isAurora = theme === "aurora";
  return {
    startOnLoad: false,
    theme: isLight ? "default" : "dark",
    themeVariables: isLight
      ? {
          primaryColor: "#eef2ff",
          primaryTextColor: "#1e1b4b",
          primaryBorderColor: "#6366f1",
          lineColor: "#c7d2fe",
          secondaryColor: "#f1f5f9",
          tertiaryColor: "#e2e8f0",
          edgeLabelBackground: "#ffffff",
          titleColor: "#4f46e5",
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: "13px",
          noteBkgColor: "#f1f5f9",
          noteTextColor: "#334155",
          noteBorderColor: "#c7d2fe",
          actorBkg: "#eef2ff",
          actorTextColor: "#1e1b4b",
          actorBorder: "#6366f1",
          signalColor: "#4f46e5",
          signalTextColor: "#1e1b4b",
        }
      : {
          primaryColor: isAurora ? "#2d2252" : "#1a1a2e",
          primaryTextColor: "#f1f5f9",
          primaryBorderColor: isAurora ? "#a78bfa" : "#7c6fe0",
          lineColor: isAurora ? "#4a3d7a" : "#3f3f52",
          secondaryColor: isAurora ? "#1f1840" : "#12121c",
          tertiaryColor: isAurora ? "#161030" : "#0d0d14",
          edgeLabelBackground: isAurora ? "#1a1435" : "#0f0f17",
          titleColor: isAurora ? "#c4b5fd" : "#a78bfa",
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: "13px",
          noteBkgColor: isAurora ? "#1f1840" : "#12121c",
          noteTextColor: "#e2e8f0",
          noteBorderColor: isAurora ? "#4a3d7a" : "#3f3f52",
          actorBkg: isAurora ? "#2d2252" : "#1a1a2e",
          actorTextColor: "#f1f5f9",
          actorBorder: isAurora ? "#a78bfa" : "#7c6fe0",
          signalColor: isAurora ? "#a78bfa" : "#7c6fe0",
          signalTextColor: "#f1f5f9",
        },
    flowchart: {
      curve: "basis",
      padding: 24,
      nodeSpacing: 50,
      rankSpacing: 60,
      useMaxWidth: false,
      htmlLabels: true,
    },
    securityLevel: "strict",
  };
}

let seq = 0;

function sanitizeSvg(svg) {
  return svg
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/on\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

export default function DiagramTab({
  diagram,
  isAnalyzing,
  analyzed,
  theme,
  sessionId,
  enabled,
  repoName,
}) {
  const ref = useRef(null);
  const [hasError, setHasError] = useState(false);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const [displayScale, setDisplayScale] = useState(1);
  const dragRef = useRef(null);
  const movedRef = useRef(false); // true when pointer moved > 4px — distinguishes drag from click
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const mountedRef = useRef(false);

  const applyTransform = useCallback((x, y, scale) => {
    transformRef.current = { x, y, scale };
    if (ref.current) {
      ref.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      ref.current.style.transformOrigin = "0 0";
    }
    // Throttle React state update to one per animation frame
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setDisplayScale(scale);
      rafRef.current = null;
    });
  }, []);

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = transformRef.current;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: x,
      originY: y,
    };
    movedRef.current = false;
  }, []);

  const onPointerMove = useCallback(
    (e) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
      const { scale } = transformRef.current;
      applyTransform(
        dragRef.current.originX + dx,
        dragRef.current.originY + dy,
        scale,
      );
    },
    [applyTransform],
  );

  const onPointerUp = useCallback((e) => {
    if (dragRef.current && e.currentTarget) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  }, []);

  const fitToScreen = useCallback(() => {
    const canvas = canvasRef.current;
    const svg = ref.current?.querySelector("svg");
    if (!canvas || !svg) return;
    const cw = canvas.clientWidth - 64;
    const ch = canvas.clientHeight - 64;
    if (cw <= 0 || ch <= 0) return;
    // Get natural (unscaled) SVG dimensions
    const currentScale = transformRef.current.scale;
    const sw = svg.getBoundingClientRect().width / currentScale;
    const sh = svg.getBoundingClientRect().height / currentScale;
    const newScale = Math.min(cw / sw, ch / sh, 2);
    const newX = (canvas.clientWidth - sw * newScale) / 2;
    const newY = (canvas.clientHeight - sh * newScale) / 2;
    applyTransform(newX, newY, newScale);
  }, [applyTransform]);

  const onWheel = useCallback(
    (e) => {
      e.preventDefault();
      const { x, y, scale } = transformRef.current;
      const delta = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(Math.max(scale * delta, 0.2), 4);
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      // Keep the point under the cursor fixed during zoom
      const newX = mouseX - (mouseX - x) * (newScale / scale);
      const newY = mouseY - (mouseY - y) * (newScale / scale);
      applyTransform(newX, newY, newScale);
    },
    [applyTransform],
  );

  const handleCopy = useCallback(async () => {
    if (!diagram) return;
    await navigator.clipboard.writeText(diagram);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [diagram]);

  const handleFullscreen = useCallback(() => {
    const el =
      canvasRef.current?.closest?.(".diagram-wrap") ?? canvasRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }, []);

  const render = useCallback(
    async (src) => {
      if (!ref.current) return;
      setHasError(false);
      setReady(false);
      setSelectedNode(null);
      try {
        const id = `gm-d-${++seq}`;
        const { svg } = await mermaid.render(id, src);
        // Mermaid v11 returns an SVG with error text instead of throwing
        if (svg.includes("Syntax error") || svg.includes("Parse error")) {
          throw new Error("Mermaid syntax error in generated diagram");
        }
        if (!ref.current) return;
        ref.current.innerHTML = sanitizeSvg(svg);
        const svgEl = ref.current.querySelector("svg");
        if (svgEl) {
          svgEl.style.maxWidth = "none";
          svgEl.style.height = "auto";
        }
        fitToScreen();
        setReady(true);
        // Professional node styling + hover glow
        ref.current.querySelectorAll("g.node").forEach((nodeEl) => {
          nodeEl.style.cursor = "pointer";
          const shapes = nodeEl.querySelectorAll(
            "rect, circle, polygon, ellipse, path",
          );
          nodeEl.addEventListener("mouseenter", () => {
            shapes.forEach((s) => {
              s.style.filter =
                "brightness(1.25) drop-shadow(0 0 14px var(--primary-glow))";
              s.style.strokeWidth = "2";
            });
          });
          nodeEl.addEventListener("mouseleave", () => {
            shapes.forEach((s) => {
              s.style.filter = "";
              s.style.strokeWidth = "";
            });
          });
        });
        // Edge hover highlight
        ref.current.querySelectorAll(".edgePath").forEach((edgeEl) => {
          const path = edgeEl.querySelector(".path");
          if (!path) return;
          edgeEl.style.cursor = "pointer";
          edgeEl.addEventListener("mouseenter", () => {
            path.style.stroke = "var(--primary)";
            path.style.strokeWidth = "2.5";
          });
          edgeEl.addEventListener("mouseleave", () => {
            path.style.stroke = "";
            path.style.strokeWidth = "";
          });
        });
      } catch (err) {
        console.error("[DiagramTab] Mermaid parse error:", err);
        setHasError(true);
        if (ref.current) {
          const pre = document.createElement("pre");
          pre.style.cssText =
            "color:var(--text-3);font-size:12px;padding:20px;white-space:pre-wrap;font-family:var(--font-mono);line-height:1.6";
          pre.textContent = diagram;
          ref.current.innerHTML = "";
          ref.current.appendChild(pre);
        }
        setReady(true);
      }
    },
    [fitToScreen, diagram],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;
      if (e.key === "Escape") {
        setSelectedNode(null);
        return;
      }
      if (e.key === "+" || e.key === "=") {
        const { x, y, scale } = transformRef.current;
        applyTransform(x, y, Math.min(scale + 0.2, 4));
      } else if (e.key === "-") {
        const { x, y, scale } = transformRef.current;
        applyTransform(x, y, Math.max(scale - 0.2, 0.2));
      } else if (e.key === "0") {
        applyTransform(0, 0, 1);
      } else if (e.key === "f" || e.key === "F") {
        fitToScreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyTransform, fitToScreen]);

  useEffect(() => {
    mermaid.initialize(getMermaidConfig(theme));
  }, []); // eslint-disable-line

  useEffect(() => {
    if (diagram) render(diagram);
  }, [diagram, render]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    mermaid.initialize(getMermaidConfig(theme));
    if (diagram) render(diagram);
    // diagram intentionally omitted: theme change should re-render whatever is currently loaded
  }, [theme, render]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!diagram && !isAnalyzing) {
    return (
      <div className="empty" style={{ gap: 16 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "var(--primary-dim)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow:
              "0 0 32px var(--primary-glow), 0 0 64px var(--primary-dim)",
            animation: "emptyPulse 3s ease-in-out infinite",
          }}
        >
          <GitBranch
            size={24}
            style={{ color: "var(--primary)" }}
            strokeWidth={1.5}
          />
        </div>
        <div className="empty-title">Architecture not available</div>
        <div className="empty-sub">
          Analyze a repository to generate the system diagram
        </div>
      </div>
    );
  }

  if (isAnalyzing && !diagram) {
    return (
      <div className="diagram-wrap">
        <div
          className="diagram-canvas"
          style={{
            flexDirection: "column",
            gap: 20,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              width: "100%",
              maxWidth: 640,
            }}
          >
            {/* Fake node boxes */}
            <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="sk"
                  style={{
                    height: 72,
                    width: 160,
                    borderRadius: 10,
                    display: "block",
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </div>
            {/* Fake edges */}
            <div style={{ display: "flex", justifyContent: "center", gap: 40 }}>
              {[0, 1].map((i) => (
                <span
                  key={i}
                  className="sk"
                  style={{
                    height: 3,
                    width: 80,
                    borderRadius: 2,
                    display: "block",
                    animationDelay: `${0.5 + i * 0.12}s`,
                  }}
                />
              ))}
            </div>
            {/* Fake sub-nodes */}
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="sk"
                  style={{
                    height: 52,
                    width: 120,
                    borderRadius: 8,
                    display: "block",
                    animationDelay: `${0.7 + i * 0.1}s`,
                  }}
                />
              ))}
            </div>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              fontFamily: "var(--font-mono)",
              marginTop: 8,
            }}
          >
            Generating architecture diagram…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="diagram-wrap">
      <div
        className="diagram-canvas"
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onClick={(e) => {
          // Pointer capture redirects pointerup to the canvas, so clicks on child SVG
          // nodes fire on the canvas too. Use elementFromPoint (visual hit-test) to
          // find the actual node under the cursor, skipping drag gestures.
          if (movedRef.current) {
            movedRef.current = false;
            return;
          }
          const hit = document.elementFromPoint(e.clientX, e.clientY);
          const nodeEl = hit?.closest?.("g.node");
          if (nodeEl) {
            const fo = nodeEl.querySelector("foreignObject");
            const label = (
              fo?.textContent ||
              nodeEl.querySelector(".label text")?.textContent ||
              nodeEl.querySelector("text")?.textContent ||
              ""
            )
              .trim()
              .replace(/\s+/g, " ");
            if (label) {
              setSelectedNode(label);
              return;
            }
          }
          setSelectedNode(null);
        }}
      >
        <div
          ref={ref}
          style={{
            display: "inline-block",
            transformOrigin: "0 0",
            willChange: "transform",
          }}
        />
      </div>

      {selectedNode && (
        <NodePanel
          node={selectedNode}
          sessionId={sessionId}
          enabled={enabled}
          onClose={() => setSelectedNode(null)}
        />
      )}

      {/* Bottom toolbar */}
      <div className="arch-legend-row">
        <div className="group">
          <span>Auto-generated by Architecture Agent</span>
          {hasError && ready && (
            <span
              style={{
                color: "var(--warning)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <AlertTriangle size={12} strokeWidth={1.5} /> Raw Mermaid
            </span>
          )}
        </div>
        <div className="group">
          {ready ? (
            <>
              <div className="diagram-controls">
                <button
                  className="btn-icon"
                  onClick={() => {
                    const { x, y, scale } = transformRef.current;
                    applyTransform(x, y, Math.max(scale - 0.2, 0.2));
                  }}
                  title="Zoom out (-)"
                >
                  <ZoomOut size={13} strokeWidth={1.5} />
                </button>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-3)",
                    width: 36,
                    textAlign: "center",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {Math.round(displayScale * 100)}%
                </span>
                <button
                  className="btn-icon"
                  onClick={() => {
                    const { x, y, scale } = transformRef.current;
                    applyTransform(x, y, Math.min(scale + 0.2, 4));
                  }}
                  title="Zoom in (+)"
                >
                  <ZoomIn size={13} strokeWidth={1.5} />
                </button>
                <button
                  className="btn-icon"
                  onClick={() => applyTransform(0, 0, 1)}
                  title="Reset zoom (0)"
                >
                  <Maximize2 size={13} strokeWidth={1.5} />
                </button>
                <button
                  className="btn-icon"
                  onClick={fitToScreen}
                  title="Fit to screen (F)"
                >
                  <Scan size={13} strokeWidth={1.5} />
                </button>
              </div>
              <div className="diagram-controls">
                <button
                  className="btn-icon"
                  onClick={handleCopy}
                  title="Copy source"
                >
                  {copied ? (
                    <Check size={13} strokeWidth={1.5} />
                  ) : (
                    <Copy size={13} strokeWidth={1.5} />
                  )}
                </button>
                <button
                  className="btn-icon"
                  onClick={handleFullscreen}
                  title="Fullscreen"
                >
                  <Expand size={13} strokeWidth={1.5} />
                </button>
              </div>
            </>
          ) : (
            <span>Scroll to navigate · Use controls to zoom</span>
          )}
        </div>
      </div>
    </div>
  );
}
