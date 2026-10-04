import type { NodeProps } from "@xyflow/react";

import { PencilIcon } from "@mechane/design-system";
import type { ShowFlowNode } from "../graph-to-flow";
import { NODE_KIND_META } from "../node-kinds";
import { BaseNode } from "./BaseNode";
import { NodeActionButton } from "./NodeActionButton";
import { NodeFieldList } from "./NodeContent";
import { useReactFlowNode } from "./use-react-flow-node";

export function SourceNode({ id, data, selected }: NodeProps<ShowFlowNode>) {
  const node = useReactFlowNode(id, data);

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
      handle={node.handle}
    >
      <NodeFieldList
        fields={data.fields}
        fieldIds={node.fieldIds}
        connectedHandleIds={node.connectedHandleIds}
        handle={node.handle}
        isConnectable
      />
      <div className="flex justify-stretch p-2">
        <NodeActionButton
          icon={PencilIcon}
          onClick={(event) => {
            event.stopPropagation();
            // A Shape-typed Source is edited one field at a time; open the first.
            const [firstField] = data.fields;
            node.openSourceValueEditor({
              nodeId: id,
              fieldPath: firstField ? [firstField.id] : [],
            });
          }}
        >
          Edit
        </NodeActionButton>
      </div>
    </BaseNode>
  );
}
