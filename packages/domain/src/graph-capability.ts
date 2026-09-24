import type { GraphEdge, GraphNode, ShowGraph } from "./graph";

export function graphNode(graph: Pick<ShowGraph, "nodes">, id: string): GraphNode | null {
  return graph.nodes.find((node) => node.id === id) ?? null;
}

export function graphEdge(graph: Pick<ShowGraph, "edges">, id: string): GraphEdge | null {
  return graph.edges.find((edge) => edge.id === id) ?? null;
}

export function graphChildren(
  graph: Pick<ShowGraph, "nodes">,
  parentId: string,
): readonly GraphNode[] {
  return graph.nodes.filter((node) => node.parentId === parentId);
}
