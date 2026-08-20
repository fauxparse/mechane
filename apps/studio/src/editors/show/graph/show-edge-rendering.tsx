import { BaseEdge, SmoothStepEdge, type EdgeProps, type Node } from "@xyflow/react";
import { SmartEdgeBatchRoutingProvider, useSmartEdgeRoute } from "@tisoap/react-flow-smart-edge";
import type { CSSProperties, ReactNode } from "react";

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
  const label = props.data?.invalidReason ? "!" : props.data?.coercing ? "↝" : undefined;
  return (
    <BaseEdge
      id={props.id}
      path={routed.svgPathString}
      labelX={routed.edgeCenterX}
      labelY={routed.edgeCenterY}
      markerStart={props.markerStart}
      markerEnd={props.markerEnd}
      style={style}
      label={label}
      labelStyle={{
        fill: props.data?.invalidReason ? "var(--destructive)" : undefined,
        fontWeight: 700,
      }}
    />
  );
}

export function ShowEdgeRoutingProvider({
  nodes,
  children,
}: {
  nodes: Node[];
  children: ReactNode;
}) {
  return (
    <SmartEdgeBatchRoutingProvider nodes={nodes} options={{ preset: "smoothstep" }}>
      {children}
    </SmartEdgeBatchRoutingProvider>
  );
}
