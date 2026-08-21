import { useMemo } from "react";
import { useNodeConnections } from "@xyflow/react";

/** The handle ids that currently have at least one edge attached. */
export function useConnectedHandleIds(nodeId: string): ReadonlySet<string> {
  const connections = useNodeConnections({ id: nodeId });
  return useMemo(() => {
    const handleIds = new Set<string>();
    for (const connection of connections) {
      if (connection.source === nodeId && connection.sourceHandle) {
        handleIds.add(connection.sourceHandle);
      }
      if (connection.target === nodeId && connection.targetHandle) {
        handleIds.add(connection.targetHandle);
      }
    }
    return handleIds;
  }, [connections, nodeId]);
}
