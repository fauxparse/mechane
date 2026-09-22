import { cn } from "@mechane/design-system";
import { Position, type NodeProps } from "@xyflow/react";

import type { ShowFlowNode } from "../graph-to-flow";
import { handleFor } from "../handle-ids";
import { HANDLE_CLASS } from "../handle-styles";
import { NODE_KIND_META } from "../node-kinds";
import { BaseNode } from "./BaseNode";
import { NodeFieldList } from "./NodeContent";
import { useReactFlowNode } from "./use-react-flow-node";

export function TransformerNode({ id, data, selected }: NodeProps<ShowFlowNode>) {
  const node = useReactFlowNode(id, data);
  if (data.kind !== "transformer") return null;
  const HandleComponent = node.handle;

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
      <div className="grid grid-cols-[2.5rem_1fr] gap-x-2">
        {data.ports.map((port) => {
          const handleId = handleFor({ kind: "field", id: port.id });
          return (
            <div
              key={port.id}
              className="relative col-span-full grid grid-cols-subgrid items-center border-t border-(--flow-border)/50 py-1.5"
            >
              <HandleComponent
                id={handleId}
                type="target"
                position={Position.Left}
                className={HANDLE_CLASS}
                data-targetable={node.targetable}
                data-connected={node.connectedHandleIds.has(handleId)}
                isConnectableStart={false}
              />
              <div className="col-start-2 flex min-w-0 items-baseline justify-between gap-2 pr-3">
                <span className="truncate font-mono text-xs">{port.name}</span>
                <span className="truncate text-[10px] text-(--flow-muted-foreground)">input</span>
              </div>
            </div>
          );
        })}
      </div>
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
