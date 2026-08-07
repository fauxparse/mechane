import { BaseEdge, SmoothStepEdge, type EdgeProps, type Node } from "@xyflow/react";
import {
  SmartEdgeBatchRoutingProvider,
  useSmartEdgeRoute,
} from "@tisoap/react-flow-smart-edge";
import type { ReactNode } from "react";

/** The native fallback avoids main-thread pathfinding while a batch route is pending. */
function BatchSmartSmoothStepEdge(props: EdgeProps) {
  const routed = useSmartEdgeRoute(props);
  if (!routed) return <SmoothStepEdge {...props} />;

  return (
    <BaseEdge
      id={props.id}
      path={routed.svgPathString}
      labelX={routed.edgeCenterX}
      labelY={routed.edgeCenterY}
      markerStart={props.markerStart}
      markerEnd={props.markerEnd}
      interactionWidth={props.interactionWidth}
      style={props.style}
    />
  );
}

export const showEdgeTypes = {
  smartSmoothStep: BatchSmartSmoothStepEdge,
};

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
