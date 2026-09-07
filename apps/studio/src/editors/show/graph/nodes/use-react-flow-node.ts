import { Handle, useUpdateNodeInternals, type HandleProps } from "@xyflow/react";
import { useEffect, type ComponentType, type MouseEventHandler } from "react";

import type { ShowFlowNode } from "../graph-to-flow";
import { useConnectedHandleIds } from "../use-connected-handle-ids";
import { useDragState } from "../use-drag-state";
import { useNodeInteraction } from "../node-interaction";

export interface ReactFlowNodeState {
  targetable: boolean;
  dimmed: boolean;
  variableIds?: ReadonlySet<string>;
  fieldIds?: ReadonlySet<string>;
  connectedHandleIds: ReadonlySet<string>;
  renaming: boolean;
  onDoubleClick: MouseEventHandler<HTMLDivElement>;
  onRenameChange(name: string): void;
  onRenameCommit(): void;
  onRenameCancel(): void;
  handle: ComponentType<HandleProps>;
}

export function useReactFlowNode(id: string, data: ShowFlowNode["data"]): ReactFlowNodeState {
  const { targetable, dimmed, variableIds, fieldIds } = useDragState(id);
  const connectedHandleIds = useConnectedHandleIds(id);
  const { renaming, beginRename, renameTo, commitRename, cancelRename } = useNodeInteraction();
  const updateNodeInternals = useUpdateNodeInternals();
  const variableHandleKey = data.variables.map((variable) => variable.id).join("|");
  const fieldHandleKey = data.fields.map((field) => field.id).join("|");

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals, variableHandleKey, fieldHandleKey]);

  return {
    targetable,
    dimmed,
    variableIds,
    fieldIds,
    connectedHandleIds,
    renaming: renaming === id,
    onDoubleClick: () => beginRename(id),
    onRenameChange: renameTo,
    onRenameCommit: commitRename,
    onRenameCancel: cancelRename,
    handle: Handle,
  };
}
