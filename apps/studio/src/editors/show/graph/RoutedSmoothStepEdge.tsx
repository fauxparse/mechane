// The React Flow adapter over <RoutedEdge> (#475).
//
// Everything vendor-shaped stops here: reading node boxes off the store,
// mapping `Position` to the router's `Side`, resolving palette tokens, and
// holding handle offsets. The drawing and the geometry below it never see
// React Flow at all, which is what lets the whole side matrix be exercised in
// Storybook.

import { Position, useInternalNode, useStore, type EdgeProps } from "@xyflow/react";
import { useCallback, useState } from "react";

import { RoutedEdge, type OffsetsBySignature } from "./RoutedEdge";
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

  // Prototype-local. The destination is the domain graph, alongside node
  // positions — a drag is an edit of the Show, not of this browser tab — but
  // that is a schema change, and the schema is what playing with this decides.
  const [offsets, setOffsets] = useState<OffsetsBySignature>({});
  const onOffsetsChange = useCallback((signature: string, next: HandleOffsets) => {
    setOffsets((current) => ({ ...current, [signature]: next }));
  }, []);

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
      offsets={offsets}
      onOffsetsChange={onOffsetsChange}
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
