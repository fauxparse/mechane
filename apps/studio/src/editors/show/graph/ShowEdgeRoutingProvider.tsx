import { SmartEdgeBatchRoutingProvider } from "@tisoap/react-flow-smart-edge";
import type { Node } from "@xyflow/react";
import type { ReactNode } from "react";

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
