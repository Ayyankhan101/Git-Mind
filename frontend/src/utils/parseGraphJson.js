import dagre from "dagre";

const NODE_WIDTH = 240;
const NODE_HEIGHT = 100;

const LAYER_RANK_MAP = {
  frontend: 0,
  api: 1,
  backend: 2,
  database: 3,
  infrastructure: 4,
  utilities: 5,
};

const TYPE_COLORS = {
  ui: "#06b6d4",
  component: "#06b6d4",
  route: "#f97316",
  controller: "#a855f7",
  service: "#22c55e",
  model: "#ef4444",
  middleware: "#a855f7",
  config: "#64748b",
  db: "#ef4444",
  util: "#eab308",
  module: "#64748b",
};

const TYPE_ICONS = {
  ui: "LayoutDashboard",
  component: "Component",
  route: "Route",
  controller: "Shield",
  service: "Cog",
  model: "Database",
  middleware: "ShieldCheck",
  config: "Settings",
  db: "Database",
  util: "Wrench",
  module: "Package",
};

const HTTP_COLORS = {
  GET: "#22c55e",
  POST: "#3b82f6",
  PUT: "#f97316",
  PATCH: "#a855f7",
  DELETE: "#ef4444",
};

const RELATIONSHIP_TO_KIND = {
  imports: "solid",
  extends: "solid",
  implements: "solid",
  inherits: "solid",
  composes: "solid",
  calls: "dashed",
  triggers: "dashed",
  dispatches: "dashed",
  publishes: "dashed",
  emits: "dotted",
  notifies: "dotted",
  subscribes: "dotted",
  streams: "animated",
  websocket: "animated",
  realtime: "animated",
};

function getImportanceSizes(importance) {
  if (importance === "primary") return { w: 280, h: 120 };
  if (importance === "secondary") return { w: 240, h: 100 };
  return { w: 200, h: 80 };
}

function layerToRank(layer) {
  return LAYER_RANK_MAP[layer] ?? 99;
}

export function parseGraphJsonToFlow(graphData) {
  const nodes = [];
  const edges = [];
  const seenNodes = new Set();

  if (!graphData || !graphData.nodes) return { nodes, edges };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 100,
    ranksep: 140,
    marginx: 40,
    marginy: 40,
  });

  for (const raw of graphData.nodes) {
    const { w, h } = getImportanceSizes(raw.importance || "secondary");
    const id = raw.id || raw.label?.toLowerCase().replace(/\s+/g, "_");
    if (seenNodes.has(id)) continue;
    seenNodes.add(id);

    const layerRank = layerToRank(raw.layer);
    const color = TYPE_COLORS[raw.type] || "#64748b";
    const icon = TYPE_ICONS[raw.type] || "File";

    const node = {
      id,
      type: "archNode",
      width: w,
      height: h,
      data: {
        label: raw.label,
        type: raw.type,
        layer: raw.layer,
        layerRank,
        icon,
        color,
        language: raw.language || "",
        framework: raw.framework || "",
        endpoints: raw.endpoints || [],
        imports: raw.imports || [],
        exports: raw.exports || [],
        importance: raw.importance || "secondary",
        filePath: raw.file_path || "",
        tier:
          raw.layer === "frontend"
            ? "frontend"
            : raw.layer === "api"
              ? "backend"
              : "config",
        category: (raw.type || "module").toUpperCase(),
      },
      position: { x: 0, y: 0 },
    };
    nodes.push(node);
    g.setNode(id, { width: w, height: h });
  }

  for (const raw of graphData.edges || []) {
    const source = raw.source;
    const target = raw.target;
    if (!seenNodes.has(source) || !seenNodes.has(target)) continue;

    const edgeId = `e-${source}-${target}`;
    const relationship = raw.relationship || "imports";
    const kind = raw.kind || RELATIONSHIP_TO_KIND[relationship] || "dashed";
    edges.push({
      id: edgeId,
      source,
      target,
      label: relationship,
      type: "animatedEdge",
      data: { kind, relationship },
    });
    g.setEdge(source, target);
  }

  dagre.layout(g);

  const positionedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - (node.width || NODE_WIDTH) / 2,
        y: pos.y - (node.height || NODE_HEIGHT) / 2,
      },
    };
  });

  return { nodes: positionedNodes, edges };
}

export { HTTP_COLORS, TYPE_COLORS, TYPE_ICONS };
