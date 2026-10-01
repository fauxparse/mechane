import { cn } from "@mechane/design-system";
import type { NodeProps } from "@xyflow/react";

import type { ShowFlowNode } from "../graph-to-flow";
import { NODE_KIND_META } from "../node-kinds";
import { BaseNode } from "./BaseNode";
import { NodeFieldList, NodeInputList } from "./NodeContent";
import { useReactFlowNode } from "./use-react-flow-node";

export function TransformerNode({ id, data, selected }: NodeProps<ShowFlowNode>) {
  const node = useReactFlowNode(id, data);
  if (data.kind !== "transformer") return null;

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
      <NodeInputList
        ports={data.ports}
        targetable={node.targetable}
        connectedHandleIds={node.connectedHandleIds}
        handle={node.handle}
        onRename={
          // Filter and Shuffle take exactly one input, always named `input`.
          data.transform.kind === "calculate"
            ? (portId, name) => node.renameTransformerPort(id, portId, name)
            : undefined
        }
      />
      <div className="border-t border-(--flow-border)/50">
        <div className="px-3 pt-2 text-[10px] tracking-wide text-(--flow-muted-foreground) uppercase">
          {data.transform.kind}
        </div>
        {data.transform.kind === "shuffle" ? (
          <div className="px-3 pb-2 font-mono text-xs">stable random order</div>
        ) : (
          // The Formula line is the way into the immersive editor, which is
          // also how a Transformer in error is reached from the graph (#686).
          <button
            type="button"
            className={cn(
              "nodrag block w-full truncate px-3 pb-2 text-left font-mono text-xs hover:bg-(--flow-border)/30",
              !data.transform.formula && "text-destructive",
            )}
            title="Open the Formula editor"
            onClick={(event) => {
              event.stopPropagation();
              node.openFormulaEditor(id);
            }}
          >
            {data.transform.formula || "Formula required"}
          </button>
        )}
      </div>
      <NodeFieldList
        fields={data.fields}
        fieldIds={node.fieldIds}
        connectedHandleIds={node.connectedHandleIds}
        handle={node.handle}
        isConnectable
      />
    </BaseNode>
  );
}
