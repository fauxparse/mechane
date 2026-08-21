import type { Position } from "@mechane/domain";

import { absolutePosition, NODE_WIDTH } from "./graph/graph-to-flow";
import type { ShowFlowNode } from "./graph/graph-to-flow";

/** Finds one compact, non-overlapping top-level layout for moved nodes. */
export function moveOutPositions(nodeIds: string[], rendered: ShowFlowNode[]): Position[] {
  const nodeIdSet = new Set(nodeIds);
  const renderedById = new Map(rendered.map((node) => [node.id, node]));
  const orderedSelected: ShowFlowNode[] = [];
  for (const nodeId of nodeIds) {
    const node = renderedById.get(nodeId);
    if (node) orderedSelected.push(node);
  }
  if (orderedSelected.length === 0) return nodeIds.map(() => ({ x: 0, y: 0 }));

  const origin = {
    x: Math.min(...orderedSelected.map((node) => absolutePosition(node, renderedById).x)),
    y: Math.min(...orderedSelected.map((node) => absolutePosition(node, renderedById).y)),
  };
  const obstacles = rendered.reduce<ReturnType<typeof rectangleFor>[]>((result, node) => {
    if (!nodeIdSet.has(node.id))
      result.push(rectangleFor(node, absolutePosition(node, renderedById)));
    return result;
  }, []);
  const sizes = orderedSelected.map((node) => ({
    width: Number(node.style?.width ?? NODE_WIDTH),
    height: Number(node.style?.height ?? 56),
  }));

  const layoutAt = (anchor: Position): Position[] => {
    let y = anchor.y;
    return sizes.map((size) => {
      const position = { x: anchor.x, y };
      y += size.height + 32;
      return position;
    });
  };
  const isFree = (positions: Position[]) =>
    positions.length === sizes.length &&
    positions.every((position, index) => {
      const size = sizes[index]!;
      return !obstacles.some((obstacle) => overlaps(position, size, obstacle));
    });

  for (let radius = 0; radius <= 40; radius += 1) {
    const distance = radius * 32;
    const candidates =
      radius === 0
        ? [origin]
        : [
            { x: origin.x + distance, y: origin.y },
            { x: origin.x - distance, y: origin.y },
            { x: origin.x, y: origin.y + distance },
            { x: origin.x, y: origin.y - distance },
          ];
    const candidate = candidates.find((position) => isFree(layoutAt(position)));
    if (candidate) return layoutAt(candidate);
  }
  return layoutAt({ x: origin.x + 32, y: origin.y + 32 });
}

function rectangleFor(node: ShowFlowNode, position: Position) {
  const width = Number(node.style?.width ?? NODE_WIDTH);
  const height = Number(node.style?.height ?? 56);
  return {
    left: position.x,
    top: position.y,
    right: position.x + width,
    bottom: position.y + height,
  };
}

function overlaps(
  position: Position,
  size: { width: number; height: number },
  obstacle: ReturnType<typeof rectangleFor>,
): boolean {
  return (
    position.x < obstacle.right &&
    position.x + size.width > obstacle.left &&
    position.y < obstacle.bottom &&
    position.y + size.height > obstacle.top
  );
}
