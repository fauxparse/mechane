// Placeholder node bodies for the Show editor (issue #40).
//
// These are stand-ins, and meant to look like it. Issue #40 is the *camera*
// — pan, zoom, controls, minimap — and the graph's visual language (icons
// per node kind, Variable rows with their own handles, Flow tinting, dangling
// -input markers) is settled separately on #35. Building half of that here
// would mean throwing it away there, so each kind renders as the same
// labelled card, sized to match the geometry ./graph-to-flow does its
// arithmetic with.
//
// What they *do* commit to, because the camera can't be judged without it:
// every node is focusable, so "arrow keys pan only when no node holds focus"
// is a thing you can actually try.
import { cn } from "@presence/design-system";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";

import type { ShowNodeData } from "./graph-to-flow";

/** Handle styling — token-driven, like everything else React Flow ships raw. */
const HANDLE_CLASS = "!h-2 !w-2 !border-background !bg-muted-foreground";

export function ShowNode({ data, selected }: NodeProps<ShowNodeData>) {
  return (
    <div
      className={cn(
        "flex flex-col justify-center gap-0.5 rounded-lg border border-border bg-card px-3 py-2 text-card-foreground shadow-sm",
        selected && "border-primary ring-2 ring-ring",
      )}
      // The node's box is set on the React Flow node itself (see
      // ./graph-to-flow), so the body fills it rather than sizing it.
      style={{ width: "100%", height: "100%" }}
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{data.kind}</span>
      <span className="truncate text-sm font-medium">{data.name}</span>
      <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />
      <Handle type="source" position={Position.Right} className={HANDLE_CLASS} />
    </div>
  );
}

/**
 * A Flow renders as the container its children sit inside — React Flow sizes
 * it from the `style` ./graph-to-flow computed, so this only paints it.
 */
export function ShowFlowNode({ data, selected }: NodeProps<ShowNodeData>) {
  return (
    <div
      className={cn(
        "h-full w-full rounded-xl border border-border bg-muted/30",
        selected && "border-primary ring-2 ring-ring",
      )}
    >
      <div className="flex items-baseline gap-2 border-b border-border/60 px-3 py-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">flow</span>
        <span className="truncate text-sm font-medium text-foreground">{data.name}</span>
      </div>
      <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />
      <Handle type="source" position={Position.Right} className={HANDLE_CLASS} />
    </div>
  );
}
