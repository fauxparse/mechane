import { Button, ChevronDown, ChevronRight, cn } from "@mechane/design-system";
import { Handle, NodeResizer, type NodeProps } from "@xyflow/react";

import { FLOW_HEADER_HEIGHT, NODE_WIDTH, type ShowFlowNode } from "../graph-to-flow";
import { useNodeInteraction } from "../node-interaction";
import { NODE_KIND_META } from "../node-kinds";
import { useConnectedHandleIds } from "../use-connected-handle-ids";
import { useDragState } from "../use-drag-state";
import { NodeHeader } from "./NodeHeader";

/**
 * A Flow uses the same node chrome as BaseNode while retaining its
 * containment-specific body and collapse control.
 */
export function FlowNode({ id, data, selected }: NodeProps<ShowFlowNode>) {
  const { targetable, dimmed } = useDragState(id);
  const connectedHandleIds = useConnectedHandleIds(id);
  const {
    renaming,
    beginRename,
    renameTo,
    commitRename,
    cancelRename,
    toggleCollapse,
    resizeFlow,
  } = useNodeInteraction();
  const childLabel = `${data.childCount} ${data.childCount === 1 ? "node" : "nodes"}`;

  return (
    <div
      className={cn(
        "show-flow group/node h-full w-full rounded-md border border-(--flow-border) bg-(--flow-area-background) text-(--flow-foreground) shadow-md transition-opacity data-[selected=true]:ring-4 data-[selected=true]:ring-(--flow-border)/50",
        dimmed && "opacity-25",
      )}
      data-flow-theme={data.color}
      data-selected={selected ?? undefined}
      data-targetable={targetable || undefined}
      onDoubleClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button,input")) return;
        beginRename(id);
      }}
      aria-label={`${NODE_KIND_META[data.kind].label}: ${data.name}`}
    >
      <NodeResizer
        isVisible={!data.collapsed}
        minWidth={NODE_WIDTH}
        minHeight={FLOW_HEADER_HEIGHT}
        color="var(--flow-border)"
        handleClassName="opacity-0"
        lineClassName="opacity-0"
        onResize={(_, dimensions) => resizeFlow(id, dimensions, { committed: false })}
        onResizeEnd={(_, dimensions) => resizeFlow(id, dimensions, { committed: true })}
      />
      <NodeHeader
        className="bg-transparent border-0"
        data={data}
        renaming={renaming === id}
        onRenameChange={renameTo}
        onRenameCommit={commitRename}
        onRenameCancel={cancelRename}
        targetable={targetable}
        showInputHandle={data.collapsed}
        connectedHandleIds={connectedHandleIds}
        handle={Handle}
        subtitleAddon={
          data.childCount > 0 ? (
            <span className="ml-2 normal-case tracking-normal opacity-75">{childLabel}</span>
          ) : null
        }
        actions={
          <Button
            variant="ghost"
            size="icon"
            className="text-(--flow-muted-foreground) hover:text-(--flow-muted-foreground) bg-transparent hover:bg-transparent opacity-50 hover:opacity-100"
            aria-label={data.collapsed ? `Expand Flow ${data.name}` : `Collapse Flow ${data.name}`}
            onClick={(event) => {
              event.stopPropagation();
              toggleCollapse(id);
            }}
          >
            {data.collapsed ? <ChevronRight /> : <ChevronDown />}
          </Button>
        }
      />
    </div>
  );
}
