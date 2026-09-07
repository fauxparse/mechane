import type { NodeProps } from "@xyflow/react";

import type { ShowFlowNode } from "../graph-to-flow";
import { NODE_KIND_META } from "../node-kinds";
import { BaseNode } from "./BaseNode";
import { NodeCueList, NodeVariableList } from "./NodeContent";
import { useReactFlowNode } from "./use-react-flow-node";

export function SceneNode({ id, data, selected }: NodeProps<ShowFlowNode>) {
  const node = useReactFlowNode(id, data);
  const wiredVariableIds = new Set(data.wiredVariableIds);
  const hasUnconnectedVariable = data.variables.some(
    (variable) => !wiredVariableIds.has(variable.id),
  );

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      targetable={node.targetable}
      dimmed={node.dimmed}
      connectedHandleIds={node.connectedHandleIds}
      renaming={node.renaming}
      onDoubleClick={node.onDoubleClick}
      onRenameChange={node.onRenameChange}
      onRenameCommit={node.onRenameCommit}
      onRenameCancel={node.onRenameCancel}
      ariaLabel={`${NODE_KIND_META[data.kind].label}: ${data.name}`}
      warning={hasUnconnectedVariable}
      handle={node.handle}
    >
      <NodeVariableList
        variables={data.variables}
        variableIds={node.variableIds}
        connectedHandleIds={node.connectedHandleIds}
        handle={node.handle}
      />
      <NodeCueList
        cues={data.cues}
        connectedHandleIds={node.connectedHandleIds}
        handle={node.handle}
      />
    </BaseNode>
  );
}
