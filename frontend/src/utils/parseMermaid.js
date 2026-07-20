import dagre from "dagre";

const NODE_WIDTH = 240;
const NODE_HEIGHT = 100;

const EDGE_LABEL_MAP = {
  http: "Sends web requests to",
  https: "Sends secure requests to",
  websocket: "Streams real-time data to",
  socket: "Streams real-time data to",
  api: "Exposes API to",
  rest: "Communicates via REST to",
  grpc: "Connects via gRPC to",
  rpc: "Connects via remote call to",

  query: "Retrieves data from",
  queries: "Retrieves data from",
  read: "Reads data from",
  write: "Writes data to",
  store: "Stores data in",
  save: "Saves data to",
  load: "Loads data from",
  fetch: "Fetches data from",
  insert: "Inserts data into",
  update: "Updates data in",
  delete: "Deletes data from",

  llm: "Processes with AI via",
  ai: "Processes with AI via",
  embed: "Generates embeddings via",
  inference: "Runs AI inference on",

  calls: "Invokes",
  invoke: "Invokes",
  trigger: "Triggers",
  dispatch: "Dispatches events to",
  notify: "Notifies",
  subscribe: "Subscribes to",
  publish: "Publishes events to",

  runs: "Executes on",
  deploy: "Deploys to",
  manage: "Manages",
  monitor: "Monitors",
  auth: "Authenticates via",
  authenticate: "Authenticates via",
  validate: "Validates through",
  transform: "Transforms data via",

  import: "Imports from",
  export: "Exports to",
  extends: "Extends",
  inherits: "Inherits from",
  implements: "Implements",
  composes: "Composed of",
  aggregates: "Aggregates",
  depends: "Depends on",
  uses: "Uses",

  props: "Sends data to",
  status: "Reports status to",
  error: "Sends errors to",
  ws: "Streams data in real-time to",
};

function humanizeEdgeLabel(label) {
  if (!label || !label.trim()) return "Connects to";
  return EDGE_LABEL_MAP[label.trim().toLowerCase()] || label.trim();
}

function getNodeCategory(label) {
  const l = label.toLowerCase();
  if (/react|tailwind|three/.test(l))
    return { category: "UI LAYER", tier: "frontend", color: "#06b6d4" };
  if (/frontend|ui|component/.test(l))
    return { category: "INTERFACE", tier: "frontend", color: "#06b6d4" };
  if (/fastapi|backend|api|server/.test(l))
    return { category: "BACKEND", tier: "backend", color: "#a855f7" };
  if (/database|postgres|redis|db/.test(l))
    return { category: "DATABASE", tier: "backend", color: "#a855f7" };
  if (/agent|pipeline/.test(l))
    return { category: "CORE AGENT", tier: "backend", color: "#a855f7" };
  if (/socket|websocket/.test(l))
    return { category: "REALTIME", tier: "backend", color: "#a855f7" };
  if (/postcss|config|plugin|build/.test(l))
    return { category: "CONFIG", tier: "config", color: "#64748b" };
  return { category: "MODULE", tier: "config", color: "#64748b" };
}

function getDagreLayout(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 120,
    ranksep: 140,
    marginx: 40,
    marginy: 40,
  });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const positionedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: positionedNodes, edges };
}

export function parseMermaidToFlow(mermaidString) {
  const nodes = [];
  const edges = [];

  if (!mermaidString) return { nodes, edges };

  const lines = mermaidString.split("\n");

  const seenNodes = new Set();
  const seenEdges = new Set();

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("graph")) return;

    // 1. Parse ALL nodes on this line (nodes and edges often share a line)
    const globalNodeRegex = /([a-zA-Z0-9_-]+)\[(.*?)\]/g;
    let nodeMatch;
    while ((nodeMatch = globalNodeRegex.exec(trimmed)) !== null) {
      const id = nodeMatch[1];
      let label = nodeMatch[2];
      label = label.replace(/^\(|\)$/g, "").trim();
      if (!label) label = id;
      if (!seenNodes.has(id)) {
        seenNodes.add(id);
        const meta = getNodeCategory(label);
        nodes.push({
          id,
          type: "archNode",
          data: {
            label,
            category: meta.category,
            tier: meta.tier,
            color: meta.color,
          },
          position: { x: 0, y: 0 },
        });
      }
    }

    // 2. Strip bracketed labels for edge detection (NodeId[Label] --> NodeId[Label])
    const stripped = trimmed.replace(/\[.*?\]/g, "");

    // Find ALL edges on this line (multiple edges can share a line, e.g. A --> B --> C)
    const globalEdgeRegex = /([a-zA-Z0-9_]+)\s*-->\|(.*?)\|\s*([a-zA-Z0-9_]+)/g;
    let edgeMatch;
    let foundEdge = false;
    while ((edgeMatch = globalEdgeRegex.exec(stripped)) !== null) {
      foundEdge = true;
      const source = edgeMatch[1],
        label = edgeMatch[2],
        target = edgeMatch[3];
      const edgeId = `e-${source}-${target}`;
      // Ensure source/target exist as nodes even if defined without brackets
      for (const id of [source, target]) {
        if (!seenNodes.has(id)) {
          seenNodes.add(id);
          nodes.push({
            id,
            type: "archNode",
            data: {
              label: id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
              category: "MODULE",
              tier: "config",
              color: "#64748b",
            },
            position: { x: 0, y: 0 },
          });
        }
      }
      if (!seenEdges.has(edgeId)) {
        seenEdges.add(edgeId);
        const nodeMap = Object.fromEntries(
          nodes.map((n) => [n.id, n.data.label]),
        );
        edges.push({
          id: edgeId,
          source,
          target,
          label: humanizeEdgeLabel(label),
          type: "animatedEdge",
          data: {
            sourceName: nodeMap[source] || source,
            targetName: nodeMap[target] || target,
          },
        });
      }
    }

    if (foundEdge) return;

    const globalSimpleEdgeRegex = /([a-zA-Z0-9_]+)\s*-->\s*([a-zA-Z0-9_]+)/g;
    while ((edgeMatch = globalSimpleEdgeRegex.exec(stripped)) !== null) {
      const source = edgeMatch[1],
        target = edgeMatch[2];
      const edgeId = `e-${source}-${target}`;
      // Ensure source/target exist as nodes even if defined without brackets
      for (const id of [source, target]) {
        if (!seenNodes.has(id)) {
          seenNodes.add(id);
          nodes.push({
            id,
            type: "archNode",
            data: {
              label: id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
              category: "MODULE",
              tier: "config",
              color: "#64748b",
            },
            position: { x: 0, y: 0 },
          });
        }
      }
      if (!seenEdges.has(edgeId)) {
        seenEdges.add(edgeId);
        const nodeMap = Object.fromEntries(
          nodes.map((n) => [n.id, n.data.label]),
        );
        edges.push({
          id: edgeId,
          source,
          target,
          label: "Connects to",
          type: "animatedEdge",
          data: {
            sourceName: nodeMap[source] || source,
            targetName: nodeMap[target] || target,
          },
        });
      }
    }
  });

  return getDagreLayout(nodes, edges);
}
