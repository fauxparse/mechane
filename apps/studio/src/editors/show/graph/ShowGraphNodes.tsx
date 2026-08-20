// The Flow node body and React Flow interaction state for the Show graph.
//
// Regular graph nodes are rendered by ../nodes/BaseNode. This module retains
// the Flow container because it has containment-specific chrome and collapse
// controls, plus the shared connection state used by the BaseNode adapter.
import { ChevronDown, ChevronRight, House, TriangleAlert, cn } from "@mechane/design-system";
import { useLayoutEffect, useRef } from "react";
import { Handle, Position, useConnection } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";

import { INPUT_HANDLE, OUTPUT_HANDLE } from "./graph-to-flow";
import type { ShowFlowNode as ShowFlowNodeType, ShowNodeData } from "./graph-to-flow";
import { nodeIcon } from "./node-kinds";
import { useNodeInteraction } from "./node-interaction";

/** Handle styling — quiet by default, accented by the active Flow colorway. */
const HANDLE_CLASS =
  "show-flow-handle !h-2 !w-2 !border-background !bg-muted-foreground data-[targetable=true]:!bg-primary";

interface HeaderProps {
  nodeId: string;
  data: ShowNodeData;
  /** Rendered smaller inside a Flow's title bar. */
  variant?: "node" | "flow";
}

function typeLabel(type: ShowNodeData["type"]): string | null {
  if (!type) return null;
  return typeof type === "string"
    ? type
    : type.kind === "array"
      ? `array<${typeLabel(type.of) ?? "?"}>`
      : `Shape:${type.shapeId}`;
}

function NodeHeader({ nodeId, data, variant = "node" }: HeaderProps) {
  const { renaming, renameTo, commitRename, cancelRename } = useNodeInteraction();
  const isRenaming = renaming === nodeId;
  const Icon = nodeIcon(data.kind, {
    perConnection: data.perConnection,
    sourceType: data.kind === "source" && typeof data.type === "string" ? data.type : undefined,
  });
  const wiredVariableIds = new Set(data.wiredVariableIds);
  const dangling = data.variables.filter((variable) => !wiredVariableIds.has(variable.id));

  return (
    <div
      className={cn("flex min-w-0 items-center gap-2 px-3", variant === "node" ? "py-2" : "py-1.5")}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      {isRenaming ? (
        <RenameField
          initialValue={data.name}
          onCommit={renameTo}
          onDone={commitRename}
          onCancel={cancelRename}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{data.name}</span>
      )}
      {typeLabel(data.type) ? (
        <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
          {typeLabel(data.type)}
        </span>
      ) : null}
      {data.isDefaultScene ? (
        // The Flow's design-time entry point (#23) — not a runtime "current
        // Scene", which this canvas deliberately doesn't represent (#35).
        <House
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-label="Flow's default Scene"
        />
      ) : null}
      {dangling.length > 0 ? (
        <TriangleAlert
          className="size-3.5 shrink-0 text-destructive"
          aria-label={`${dangling.length} Variable${dangling.length === 1 ? "" : "s"} with nothing wired in`}
        />
      ) : null}
      {data.kind === "device" && !data.driven ? (
        // A Device nothing drives displays nothing at performance time —
        // the same class of invisible-until-too-late mistake as a dangling
        // Variable, and marked the same way. It is not an error: creating
        // the projector before the Flow is ordinary work (#45).
        <TriangleAlert
          className="size-3.5 shrink-0 text-destructive"
          aria-label="Nothing is wired to this Device"
        />
      ) : null}
      {variant === "flow" && data.childCount > 0 ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {data.childCount} {data.childCount === 1 ? "node" : "nodes"}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The inline rename field. Renders inside the node it renames, and lives in
 * `.nokey` so React Flow's own key handling leaves it alone while typing —
 * which is also what stops Backspace deleting the node mid-rename.
 */
function RenameField({
  initialValue,
  onCommit,
  onDone,
  onCancel,
}: {
  initialValue: string;
  onCommit(name: string): void;
  onDone(): void;
  onCancel(): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    input.current?.select();
  }, []);
  return (
    <input
      ref={input}
      className="nokey min-w-0 flex-1 rounded-sm bg-background px-1 text-sm font-medium outline-1 outline-primary"
      defaultValue={initialValue}
      aria-label="Name"
      autoFocus
      // Every keystroke is a command, coalesced into one undo entry by the
      // gesture wrapping the rename (#28) — so typing six letters is one
      // Cmd+Z, and the graph is live-correct while it's happening.
      onChange={(event) => onCommit(event.target.value)}
      onBlur={onDone}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") onDone();
        if (event.key === "Escape") onCancel();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  );
}

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
  };
}

/**
 * A Flow renders as the container its children sit inside — React Flow sizes
 * it from the `style` ./graph-to-flow computed, so this paints it and carries
 * the title bar #35 specifies (name, node count, and the Device handle).
 *
 * Collapse is #44's: it's local view state, outside the Command system
 * entirely (#28), and the title bar is deliberately the same shape either way
 * so collapsing reads as the node shrinking rather than becoming a new thing.
 */
export function ShowFlowNode({ id, data, selected }: NodeProps<ShowFlowNodeType>) {
  const { targetable, dimmed } = useDragState(id);
  const { beginRename, toggleCollapse } = useNodeInteraction();

  return (
    <div
      className={cn(
        "show-flow h-full w-full rounded-xl border border-border transition-opacity",
        selected && "show-flow-selected",
        targetable && !selected && "show-flow-targetable",
        dimmed && "opacity-25",
      )}
      data-flow-theme={data.color}
      onDoubleClick={(event) => {
        // A double-click on a child bubbles here too; only the Flow's own
        // chrome should rename the Flow.
        if (
          event.currentTarget !== event.target &&
          !event.currentTarget.contains(event.target as Node)
        )
          return;
        beginRename(id);
      }}
      aria-label={`Flow: ${data.name}`}
    >
      <div className="show-flow-header border-b border-border/60">
        <div className="flex items-center">
          <button
            type="button"
            className="nodrag nopan shrink-0 p-1 text-muted-foreground hover:text-foreground"
            aria-label={data.collapsed ? `Expand Flow ${data.name}` : `Collapse Flow ${data.name}`}
            onClick={(event) => {
              event.stopPropagation();
              toggleCollapse(id);
            }}
          >
            {data.collapsed ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <NodeHeader nodeId={id} data={data} variant="flow" />
          </div>
        </div>
      </div>
      <Handle
        id={INPUT_HANDLE}
        type="target"
        position={Position.Left}
        className={HANDLE_CLASS}
        data-targetable={targetable}
        isConnectableStart={false}
      />
      <Handle
        id={OUTPUT_HANDLE}
        type="source"
        position={Position.Right}
        className={HANDLE_CLASS}
        isConnectableEnd={false}
      />
    </div>
  );
}
