import type { NodeProps } from "@xyflow/react";

import type { ShowFlowNode } from "../graph-to-flow";
import { NODE_KIND_META } from "../node-kinds";
// PROTOTYPE #675: the Formula-authoring prototype swaps this node's body when
// `?variant=` is on the URL. Delete this import with the prototype.
import {
  PROTOTYPE_VARIANT_COMPONENTS,
  activeVariant,
  usePrototypeTransform,
} from "../prototype-formula-authoring";
import { BaseNode } from "./BaseNode";
import { NodeFieldList } from "./NodeContent";
import { useReactFlowNode } from "./use-react-flow-node";

export function TransformerNode({ id, data, selected }: NodeProps<ShowFlowNode>) {
  const node = useReactFlowNode(id, data);
  const variant = activeVariant();
  const prototype = usePrototypeTransform(id);
  const PrototypeBody = variant ? PROTOTYPE_VARIANT_COMPONENTS[variant] : null;

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
      showOutputHandle={PrototypeBody ? PrototypeBody.headerOutputHandle : true}
      handle={node.handle}
    >
      {PrototypeBody ? (
        <PrototypeBody.NodeBody
          nodeId={id}
          transform={prototype}
          handle={node.handle}
          connectedHandleIds={node.connectedHandleIds}
          targetable={node.targetable}
          selected={selected ?? false}
        />
      ) : (
        <NodeFieldList
          fields={data.fields}
          fieldIds={node.fieldIds}
          connectedHandleIds={node.connectedHandleIds}
          handle={node.handle}
          isConnectable
        />
      )}
    </BaseNode>
  );
}
