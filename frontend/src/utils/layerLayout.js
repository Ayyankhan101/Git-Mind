import dagre from "dagre";

const DEFAULT_NODE_W = 240;
const DEFAULT_NODE_H = 100;

/**
 * Apply a layer-aware dagre layout.
 *
 * Nodes with a `data.layerRank` are placed in rank order
 * (0 = frontend top, 5 = utilities bottom).
 * Within each layer, nodes are arranged left-to-right.
 */
export function applyLayerLayout(nodes, edges) {
  if (!nodes.length) return nodes;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 120,
    ranksep: 140,
    marginx: 40,
    marginy: 40,
  });

  for (const node of nodes) {
    const w = node.width || DEFAULT_NODE_W;
    const h = node.height || DEFAULT_NODE_H;
    g.setNode(node.id, { width: w, height: h });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - (node.width || DEFAULT_NODE_W) / 2,
        y: pos.y - (node.height || DEFAULT_NODE_H) / 2,
      },
    };
  });
}

/**
 * Sort nodes by layer rank so dagre places upper layers first.
 */
export function sortByLayer(nodes) {
  return [...nodes].sort((a, b) => {
    const ra = a.data?.layerRank ?? 99;
    const rb = b.data?.layerRank ?? 99;
    if (ra !== rb) return ra - rb;
    return (a.data?.label || "").localeCompare(b.data?.label || "");
  });
}
