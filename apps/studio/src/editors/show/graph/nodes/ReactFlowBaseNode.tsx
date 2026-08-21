import { Handle, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import { useEffect } from "react";

import type { ShowFlowNode } from "../graph-to-flow";
import { useConnectedHandleIds } from "../use-connected-handle-ids";
import { useDragState } from "../use-drag-state";
import { useNodeInteraction } from "../node-interaction";
import { NODE_KIND_META } from "../node-kinds";
import { BaseNode } from "./BaseNode";

/**
 * React Flow adapter for the presentation-only BaseNode.
 *
 * Keep React Flow hooks and the real Handle implementation here so BaseNode
 * can render in Storybook and other non-canvas contexts without a provider.
 */
export function ReactFlowBaseNode({ id, data, selected }: NodeProps<ShowFlowNode>) {
  const { targetable, dimmed, variableIds } = useDragState(id);
  const connectedHandleIds = useConnectedHandleIds(id);
  const { renaming, beginRename, renameTo, commitRename, cancelRename } = useNodeInteraction();
  const updateNodeInternals = useUpdateNodeInternals();
  const variableHandleKey = data.variables.map((variable) => variable.id).join("|");

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals, variableHandleKey]);
  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      targetable={targetable}
      dimmed={dimmed}
      variableIds={variableIds}
      connectedHandleIds={connectedHandleIds}
      renaming={renaming === id}
      onDoubleClick={() => beginRename(id)}
      onRenameChange={renameTo}
      onRenameCommit={commitRename}
      onRenameCancel={cancelRename}
      ariaLabel={`${NODE_KIND_META[data.kind].label}: ${data.name}`}
      handle={Handle}
    />
  );
}
