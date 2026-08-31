// The React Flow adapter over <RoutedEdge> (#475).
//
// Everything vendor-shaped stops here: reading node boxes off the store,
// mapping `Position` to the router's `Side`, resolving palette tokens, and
// holding handle offsets. The drawing and the geometry below it never see
// React Flow at all, which is what lets the whole side matrix be exercised in
// Storybook.

import { Position, useInternalNode, useStore, type EdgeProps } from "@xyflow/react";
import { useCallback } from "react";

import { RoutedEdge } from "./RoutedEdge";
import { useEdgeInteraction } from "./edge-interaction";
import type { HandleOffsets } from "./edge-path";
import type { Endpoint, Rect, Side } from "./edge-routing";
import type { ShowFlowEdge } from "./graph-to-flow";

const SIDES: Record<Position, Side> = {
  [Position.Right]: "right",
  [Position.Bottom]: "bottom",
  [Position.Left]: "left",
  [Position.Top]: "top",
};

/** A palette colorway as a CSS color the blend can mix in. */
function tokenFor(color: string | undefined): string {
  if (!color || color === "neutral") return "var(--flow-500)";
  return `var(--palette-${color}-500)`;
}

export function RoutedSmoothStepEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerStart,
  markerEnd,
  data,
}: EdgeProps<ShowFlowEdge>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const zoom = useStore((state) => state.transform[2]);
  const { moveEdge } = useEdgeInteraction();

  // A drag goes straight into the graph, so the preview the user sees is the
  // edit itself rather than a local copy of it that has to be reconciled
  // afterwards. The gesture behind `moveEdge` keeps the whole drag to one
  // undo entry (#475).
  const onOffsetsChange = useCallback(
    (signature: string, next: HandleOffsets, meta: { committed: boolean }) => {
      moveEdge(id, { ...data?.layout, [signature]: asLayout(next) }, meta);
    },
    [moveEdge, id, data?.layout],
  );

  const sourceEndpoint = endpointFor(sourceNode, { x: sourceX, y: sourceY }, sourcePosition);
  const targetEndpoint = endpointFor(targetNode, { x: targetX, y: targetY }, targetPosition);
  if (!sourceEndpoint || !targetEndpoint) return null;

  return (
    <RoutedEdge
      key={id}
      source={sourceEndpoint}
      target={targetEndpoint}
      sourceColor={tokenFor(data?.sourceColor)}
      targetColor={tokenFor(data?.targetColor)}
      offsets={data?.layout ?? undefined}
      onOffsetsChange={onOffsetsChange}
      fan={fanFor(data?.parallelIndex ?? 0, data?.parallelCount ?? 1)}
      selected={selected}
      zoom={zoom}
      markerStart={markerStart}
      markerEnd={markerEnd}
      label={data?.invalidReason ? "!" : data?.coercing ? "↝" : undefined}
      labelColor={data?.invalidReason ? "var(--destructive)" : undefined}
    />
  );
}

/**
 * How far this edge steps aside from the others sharing its handles: evenly
 * spread about the route they would all otherwise share, so no edge in a pair
 * sits where a lone edge would and the set stays symmetrical.
 */
function fanFor(index: number, count: number): number {
  if (count <= 1) return 0;
  return (index - (count - 1) / 2) * FAN_SPACING;
}

/** Enough to clear a handle's width, so neighbouring handles stay separable. */
const FAN_SPACING = 16;

/**
 * Handle offsets are numbers keyed by run index in the geometry, and strings
 * keyed the same way once they are JSON on their way to the server. The two
 * are the same record; this is where the type says so.
 */
function asLayout(offsets: HandleOffsets): Record<string, number> {
  return Object.fromEntries(
    Object.entries(offsets).filter(([, offset]) => Number.isFinite(offset) && offset !== 0),
  );
}

/**
 * A node's box in absolute coordinates. React Flow keeps a Flow-local node's
 * `position` relative to its Flow and the resolved one on the *internal* node,
 * which is the one the router needs — it works in absolute coordinates and
 * knows nothing about containment.
 */
function endpointFor(
  node: ReturnType<typeof useInternalNode>,
  point: { x: number; y: number },
  position: Position,
): Endpoint | null {
  if (!node) return null;
  const { width, height } = node.measured;
  if (width === undefined || height === undefined) return null;

  const rect: Rect = { ...node.internals.positionAbsolute, width, height };
  return { point, side: SIDES[position], rect };
}
