import { cn, SidebarHeader, SquareDashedIcon } from "@mechane/design-system";
import type { GraphNode } from "@mechane/domain";
import type { GraphEditing } from "@show-editor/commands/use-graph-editing";
import { pluralize } from "../../../../utils/pluralize";
import { NODE_KIND_META, nodeIcon } from "../node-kinds";
import { SingleNode } from "./SingleNode";

export interface GraphInspectorProps {
  /** The selected nodes, in graph order. */
  selected: GraphNode[];
  editing: GraphEditing;
  className?: string;
}

function common<T>(selected: readonly GraphNode[], get: (node: GraphNode) => T): T | null {
  const [first] = selected;
  if (!first) return null;
  const value = get(first);
  return selected.every((node) => Object.is(get(node), value)) ? value : null;
}

function InspectorHeader({ selected }: { selected: GraphNode[] }) {
  const kind = common(selected, (node) => node.kind);
  const perConnection = common(selected, (node) =>
    node.kind === "device" ? node.perConnection : false,
  );
  const sourceType = common(selected, (node) =>
    node.kind === "source" && typeof node.type === "string" ? node.type : undefined,
  );
  const Icon = kind
    ? nodeIcon(kind, {
        perConnection: perConnection ?? false,
        sourceType: sourceType ?? undefined,
      })
    : SquareDashedIcon;
  const [first] = selected;
  const name = selected.length === 1 ? (first?.name ?? null) : null;
  const label =
    perConnection && kind === "device"
      ? "audience device"
      : kind
        ? NODE_KIND_META[kind].label
        : "node";

  return (
    <SidebarHeader>
      <div className="flex items-center gap-2">
        <Icon className="size-4" />
        <span className="truncate grow">{name ?? pluralize(label, selected.length)}</span>
      </div>
    </SidebarHeader>
  );
}

function MultiSelection({ selected }: { selected: GraphNode[] }) {
  const counts = new Map<GraphNode["kind"], number>();
  for (const node of selected) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{selected.length} selected</h2>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        {[...counts].map(([kind, count]) => (
          <li key={kind}>
            {count} {count === 1 ? NODE_KIND_META[kind].label : `${NODE_KIND_META[kind].label}s`}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GraphInspector({ selected, editing, className }: GraphInspectorProps) {
  if (selected.length === 0) return null;
  const [node] = selected;
  if (!node) return null;

  return (
    <aside
      // `nokey` is React Flow's own escape hatch: keys pressed in here are the
      // panel's, not the canvas's (#37).
      className={cn("nokey display-contents pointer-events-auto", className)}
      aria-label="Inspector"
    >
      <InspectorHeader selected={selected} />
      {selected.length > 1 ? (
        <MultiSelection selected={selected} />
      ) : (
        <SingleNode node={node} editing={editing} />
      )}
    </aside>
  );
}
