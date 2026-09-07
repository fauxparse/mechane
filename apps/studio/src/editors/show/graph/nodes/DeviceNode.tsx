import type { NodeProps } from "@xyflow/react";

import type { ShowFlowNode } from "../graph-to-flow";
import { NODE_KIND_META } from "../node-kinds";
import { BaseNode } from "./BaseNode";
import { DevicePairing } from "./NodeContent";
import { useReactFlowNode } from "./use-react-flow-node";

export function DeviceNode({ id, data, selected }: NodeProps<ShowFlowNode>) {
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
      warning={!data.driven}
      showOutputHandle={false}
      handle={node.handle}
    >
      <DevicePairing
        pairingCode={data.pairingCode}
        connectedHandleIds={node.connectedHandleIds}
        handle={node.handle}
      />
    </BaseNode>
  );
}
