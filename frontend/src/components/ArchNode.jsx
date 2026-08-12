import React from "react";
import { Handle, Position } from "@xyflow/react";
import {
  Shield,
  Cog,
  Database,
  Route,
  LayoutDashboard,
  Component,
  Settings,
  Wrench,
  File,
  Package,
  ShieldCheck,
  Server,
  Globe,
} from "lucide-react";
import { fs } from "../typeScale";

const ICON_MAP = {
  Shield,
  Cog,
  Database,
  Route,
  LayoutDashboard,
  Component,
  Settings,
  Wrench,
  File,
  Package,
  ShieldCheck,
  Server,
  Globe,
};

const LAYER_COLORS = {
  frontend: {
    border: "var(--info)",
    glow: "var(--bloom-3)",
    text: "var(--info)",
    bg: "var(--primary-dim)",
  },
  api: {
    border: "var(--info)",
    glow: "var(--bloom-3)",
    text: "var(--info)",
    bg: "var(--primary-dim)",
  },
  backend: {
    border: "var(--primary)",
    glow: "var(--primary-glow)",
    text: "var(--primary)",
    bg: "var(--primary-dim)",
  },
  database: {
    border: "var(--primary)",
    glow: "var(--primary-glow)",
    text: "var(--primary)",
    bg: "var(--primary-dim)",
  },
  infrastructure: {
    border: "var(--text-3)",
    glow: "var(--bloom-3)",
    text: "var(--text-3)",
    bg: "var(--surface-3)",
  },
  utilities: {
    border: "var(--success)",
    glow: "var(--bloom-2)",
    text: "var(--success)",
    bg: "var(--primary-dim)",
  },
};

const TYPE_LABELS = {
  ui: "UI",
  component: "Component",
  route: "API Route",
  controller: "Controller",
  service: "Service",
  model: "Model",
  middleware: "Middleware",
  config: "Config",
  db: "Database",
  util: "Utility",
  module: "Module",
};

const HTTP_METHOD_COLORS = {
  GET: "var(--success)",
  POST: "var(--info)",
  PUT: "var(--warning)",
  PATCH: "var(--sev-high)",
  DELETE: "var(--danger)",
};

function inferTypeLabel(data) {
  if (data.type && data.type !== "module" && data.type !== "unknown")
    return (TYPE_LABELS[data.type] || data.type).toUpperCase();

  const label = (data.label || "").toLowerCase();
  const path = (data.filePath || "").toLowerCase();
  const fw = (data.framework || "").toLowerCase();
  const allImports = (data.imports || []).join(" ").toLowerCase();

  if (/api|route|endpoint/.test(label) || /\/api\//.test(path)) return "API";
  if (/auth|login|signin|oauth|jwt/.test(label) || /auth/.test(path))
    return "AUTH";
  if (/cache|redis/.test(label)) return "CACHE";
  if (/config|setting|env/.test(label) || /config/.test(path)) return "CONFIG";
  if (/component|widget|ui$|^ui/.test(label)) return "COMPONENT";
  if (/controller/.test(label)) return "CONTROLLER";
  if (/database|db|sql|mongo|postgres|mysql/.test(label)) return "DATABASE";
  if (/hook|use[A-Z]/.test(label)) return "HOOK";
  if (/logger|log|monitor|trace/.test(label)) return "LOGGER";
  if (/middleware/.test(label)) return "MIDDLEWARE";
  if (/model|entity|schema/.test(label)) return "MODEL";
  if (/page|screen|view/.test(label)) return "PAGE";
  if (/real.?time|websocket|socket/.test(label)) return "REALTIME";
  if (/router|route/.test(label)) return "ROUTER";
  if (/service/.test(label)) return "SERVICE";
  if (/storage|s3|blob|file/.test(label)) return "STORAGE";
  if (/util|helper|function|lib/.test(label)) return "UTILITY";
  if (/external|integration|webhook/.test(label)) return "EXTERNAL API";

  if (
    fw.includes("express") ||
    allImports.includes("express") ||
    fw.includes("fastify")
  )
    return "ROUTER";
  if (
    fw.includes("react") ||
    fw.includes("vue") ||
    fw.includes("svelte") ||
    allImports.includes("react")
  )
    return "COMPONENT";
  if (
    allImports.includes("prisma") ||
    allImports.includes("mongoose") ||
    allImports.includes("typeorm")
  )
    return "MODEL";

  if (data.endpoints && data.endpoints.length > 0) {
    if (data.layer === "api") return "API";
    if (data.layer === "backend") return "CONTROLLER";
  }

  if (data.layer === "frontend") return "COMPONENT";
  if (data.layer === "backend") return "SERVICE";
  if (data.layer === "api") return "API";
  if (data.layer === "database") return "DATABASE";
  if (data.layer === "utilities") return "UTILITY";
  if (data.layer === "infrastructure") return "CONFIG";

  return "MODULE";
}

export default function ArchNode({ data, selected }) {
  const layer = data.layer || "config";
  const colors = LAYER_COLORS[layer] || LAYER_COLORS.infrastructure;

  const IconComp = ICON_MAP[data.icon] || File;
  const typeLabel = inferTypeLabel(data);
  const endpoints = data.endpoints || [];
  const imports = data.imports || [];
  const language = data.language || "";
  const framework = data.framework || "";

  const cardStyle = {
    background: `linear-gradient(135deg, ${colors.bg}, var(--surface-1))`,
    borderColor: colors.border.replace("0.5)", "0.65)"),
    boxShadow: selected
      ? `0 0 30px ${colors.glow}, 0 0 60px ${colors.glow}, inset 0 1px 0 var(--border-s)`
      : `0 6px 24px rgba(0,0,0,0.4), inset 0 1px 0 var(--border-s)`,
  };

  const handleCommon = {
    background: colors.text,
    border: `2px solid ${colors.border}`,
    width: 10,
    height: 10,
  };

  return (
    <div
      className="group rounded-xl border backdrop-blur-xl transition-all duration-300 select-none cursor-pointer overflow-hidden arch-node-card"
      style={{
        ...cardStyle,
        animation: "nodeFadeIn 0.4s ease-out both",
        animationDelay: `${(data.layerRank || 0) * 0.08}s`,
      }}
    >
      <Handle type="target" position={Position.Top} style={handleCommon} />

      <div
        className="px-4 py-3 flex flex-col gap-2 pointer-events-none"
        style={{ minWidth: 200, maxWidth: 300 }}
      >
        {/* Icon + Title row */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: colors.bg, color: colors.text }}
          >
            <IconComp size={18} strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4
                className="truncate"
                style={{
                  fontSize: fs.xl,
                  fontWeight: 700,
                  color: "var(--text-1)",
                }}
              >
                {data.label}
              </h4>
              <span
                className="text-[12px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-widest shrink-0 leading-none"
                style={{
                  background: colors.border
                    .replace("0.5)", "0.25)")
                    .replace("0.65)", "0.3)"),
                  color: "var(--text-1)",
                  border: `1px solid ${colors.border.replace("0.5)", "0.35)").replace("0.65)", "0.4)")}`,
                }}
              >
                {typeLabel}
              </span>
            </div>
            {(language || framework) && (
              <div
                className="text-[11px] mt-0.5 truncate"
                style={{ color: "var(--text-2)" }}
              >
                {language}
                {framework ? ` · ${framework}` : ""}
              </div>
            )}
          </div>
        </div>

        {/* Endpoint pills */}
        {endpoints.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {endpoints.slice(0, 4).map((ep, i) => {
              const methodColor =
                HTTP_METHOD_COLORS[ep.method] || "var(--text-3)";
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono leading-none truncate max-w-full"
                  style={{
                    background: `${methodColor}15`,
                    border: `1px solid ${methodColor}30`,
                  }}
                  title={`${ep.method} ${ep.path}`}
                >
                  <span style={{ color: methodColor, fontWeight: 700 }}>
                    {ep.method}
                  </span>
                  <span className="truncate" style={{ color: "var(--text-2)" }}>
                    {ep.path}
                  </span>
                </span>
              );
            })}
            {endpoints.length > 4 && (
              <span
                className="text-[10px] px-1"
                style={{ color: "var(--text-3)" }}
              >
                +{endpoints.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Imports / Export chips */}
        <div
          className="flex items-center gap-2 text-[11px]"
          style={{ color: "var(--text-3)" }}
        >
          {imports.length > 0 && (
            <div className="flex items-center gap-1 truncate min-w-0">
              <span className="shrink-0 opacity-60">in</span>
              <span className="truncate">{imports.slice(0, 4).join(", ")}</span>
              {imports.length > 4 && <span>+{imports.length - 4}</span>}
            </div>
          )}
          {endpoints.length > 0 && (
            <span
              className="shrink-0 ml-auto text-[11px] font-mono"
              style={{ color: colors.text, opacity: 0.6 }}
            >
              {endpoints.length > 1 ? `${endpoints.length} APIs` : "1 API"}
            </span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} style={handleCommon} />
    </div>
  );
}
