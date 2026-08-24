import { FLOW_NODE_TYPE } from "./graph-to-flow";
import type { ShowFlowEdge, ShowFlowNode } from "./graph-to-flow";

export interface ReconcileNodesOptions {
  dragging?: boolean;
  manualFlowIds?: ReadonlySet<string>;
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
    const preservePosition =
      options.dragging === true ||
      (node.type === FLOW_NODE_TYPE && options.manualFlowIds?.has(node.id) === true);

    return {
      ...existing,
      ...node,
      ...(collapseChanged ? { measured: undefined } : {}),
      ...(preservePosition ? { position: existing.position } : {}),
      selected: selectingArrival ? node.id === options.selectOnArrival : existing.selected,
    };
  });
}

/** Reconciles freshly drawn edges with React Flow's live selection state. */
export function reconcileEdges(
  drawn: readonly ShowFlowEdge[],
  live: readonly ShowFlowEdge[],
): ShowFlowEdge[] {
  const liveById = new Map(live.map((edge) => [edge.id, edge]));

  return drawn.map((edge) => {
    const existing = liveById.get(edge.id);
    return existing ? { ...existing, ...edge, selected: existing.selected } : edge;
  });
}
