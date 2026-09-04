import { FLOW_NODE_TYPE } from "./graph-to-flow";
import type { ShowFlowEdge, ShowFlowNode } from "./graph-to-flow";

export interface ReconcileNodesOptions {
  dragging?: boolean;
  selectOnArrival?: string | null;
}

/**
 * Reconciles freshly drawn nodes with React Flow's live interaction state.
 * Drawn graph data wins except for state owned by an active interaction.
 */
export function reconcileNodes(
  drawn: readonly ShowFlowNode[],
  live: readonly ShowFlowNode[],
  options: ReconcileNodesOptions = {},
): ShowFlowNode[] {
  const liveById = new Map(live.map((node) => [node.id, node]));
  const selectingArrival =
    options.selectOnArrival !== undefined && options.selectOnArrival !== null;

  return drawn.map((node) => {
    const existing = liveById.get(node.id);
    if (!existing) {
      return selectingArrival ? { ...node, selected: node.id === options.selectOnArrival } : node;
    }

    const collapseChanged =
      node.type === FLOW_NODE_TYPE &&
      existing.type === FLOW_NODE_TYPE &&
      existing.data.collapsed !== node.data.collapsed;
    const preservePosition = options.dragging === true;

    return {
      ...existing,
      ...node,
      ...(collapseChanged ? { measured: undefined } : {}),
      ...(preservePosition ? { position: existing.position } : {}),
      selected: selectingArrival ? node.id === options.selectOnArrival : existing.selected,
    };
  });
}

/**
 * Where a selected edge sits in the stack. React Flow paints the node layer
 * after the edge layer and lifts a selected node to 1000, so anything less
 * than that leaves a selected edge behind the nodes it runs between — and the
 * edge is exactly what the author is looking at. React Flow adds the endpoint
 * node's own z on top of this, so the margin only ever grows.
 */
export const SELECTED_EDGE_Z = 2000;

/** Reconciles freshly drawn edges with React Flow's live selection state. */
export function reconcileEdges(
  drawn: readonly ShowFlowEdge[],
  live: readonly ShowFlowEdge[],
): ShowFlowEdge[] {
  const liveById = new Map(live.map((edge) => [edge.id, edge]));

  return drawn.map((edge) => {
    const existing = liveById.get(edge.id);
    if (!existing) return edge;
    return {
      ...existing,
      ...edge,
      selected: existing.selected,
      zIndex: existing.selected ? SELECTED_EDGE_Z : undefined,
    };
  });
}
