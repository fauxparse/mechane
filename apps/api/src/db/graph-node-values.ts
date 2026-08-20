import type { GraphNode } from "@mechane/domain";

export function graphNodeInsertValues(node: GraphNode, graphId: string) {
  return {
    id: node.id,
    graphId,
    kind: node.kind,
    name: node.name,
    color: node.kind === "flow" ? (node.color ?? null) : null,
    parentId: node.parentId,
    defaultSceneId: node.kind === "flow" ? node.defaultSceneId : null,
    type: node.kind === "source" || node.kind === "transformer" ? (node.type ?? null) : null,
    positionX: node.position.x,
    positionY: node.position.y,
  };
}
