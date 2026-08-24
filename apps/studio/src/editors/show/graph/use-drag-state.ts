import { useConnection } from "@xyflow/react";

import { useNodeInteraction } from "./node-interaction";

/** Whether a connection is being dragged, and what it may land on. */
export function useDragState(nodeId: string) {
  const { targets, connecting } = useNodeInteraction();
  // React Flow knows when a connection is in flight; the *targets* are the
  // domain's answer (`connectionTargets`), gathered at drag start.
  const connectionNodeId = useConnection((connection) =>
    connection.inProgress ? connection.fromNode.id : null,
  );
  const inFlight = connecting || connectionNodeId !== null;
  const targetable = inFlight && (targets?.nodeIds.has(nodeId) ?? false);
  return {
    targetable,
    // The node being dragged *from* isn't dimmed: it's the subject of the
    // gesture, not a rejected target.
    dimmed: inFlight && !targetable && connectionNodeId !== nodeId,
    variableIds: targets?.variableIds,
    fieldIds: targets?.fieldIds,
  };
}
