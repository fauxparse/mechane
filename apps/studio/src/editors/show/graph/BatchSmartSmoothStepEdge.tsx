import { BaseEdge, SmoothStepEdge, type EdgeProps } from "@xyflow/react";
import { useSmartEdgeRoute } from "@tisoap/react-flow-smart-edge";
import type { CSSProperties } from "react";

import { edgeStatus } from "./edge-status";
import type { ShowEdgeData } from "./graph-to-flow";

function edgeStyle(props: EdgeProps): CSSProperties {
  const color = props.data?.color ?? "neutral";
  return {
    ...props.style,
    "--flow-edge-500": color === "neutral" ? "var(--flow-500)" : `var(--palette-${color}-500)`,
  } as CSSProperties;
}

/** The native fallback avoids main-thread pathfinding while a batch route is pending. */
export function BatchSmartSmoothStepEdge(props: EdgeProps) {
  const routed = useSmartEdgeRoute(props);
  const style = edgeStyle(props);
  if (!routed) return <SmoothStepEdge {...props} style={style} />;
  const status = edgeStatus(props.data as ShowEdgeData | undefined);
  return (
    <BaseEdge
      id={props.id}
      path={routed.svgPathString}
      labelX={routed.edgeCenterX}
      labelY={routed.edgeCenterY}
      markerStart={props.markerStart}
      markerEnd={props.markerEnd}
      style={style}
      label={status.glyph}
      labelStyle={{ fill: status.color, fontWeight: 700 }}
    />
  );
}
