import {
  CableIcon,
  cn,
  EditableName,
  InputGroupAddon,
  InspectorProvider,
  SidebarHeader,
  SquareDashedIcon,
} from "@mechane/design-system";
import type { EdgeKind, GraphEdge, GraphNode } from "@mechane/domain";
import type { GraphInspectorEditing } from "@show-editor/commands/use-graph-editing";
import { pluralize } from "../../../../utils/pluralize";
import { NODE_KIND_META, nodeIcon } from "../node-kinds";
import { SingleEdge } from "./SingleEdge";
import { SingleNode } from "./SingleNode";

export interface GraphInspectorProps {
  /** The selected nodes, in graph order. */
  selected: GraphNode[];
  /**
   * The selected edges, in graph order. Nodes win when both are selected:
   * a node carries editable properties and an edge currently does not.
   */
  selectedEdges: GraphEdge[];
  editing: GraphInspectorEditing;
  className?: string;
}

function common<T>(selected: readonly GraphNode[], get: (node: GraphNode) => T): T | null {
  const [first] = selected;
  if (!first) return null;
  const value = get(first);
  return selected.every((node) => Object.is(get(node), value)) ? value : null;
}

function InspectorHeader({
  selected,
  editing,
}: {
  selected: GraphNode[];
  editing: GraphInspectorEditing;
}) {
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
  const name = selected.length === 1 ? (first?.name ?? "") : null;
  const label =
    perConnection && kind === "device"
      ? "audience device"
      : kind
        ? NODE_KIND_META[kind].label
        : "node";

  return (
    <SidebarHeader>
      <div className="flex items-center gap-2">
        {name !== null ? (
          <EditableName
            key={first?.id}
            value={name}
            ariaLabel="Name"
            onStartEditing={() => {
              if (first) editing.beginRename(first.id);
            }}
            onCommit={(nextName) => {
              editing.renameTo(nextName);
              editing.commitRename();
            }}
            onCancel={editing.cancelRename}
          >
            <InputGroupAddon align="inline-start" className="px-1 mr-0">
              <Icon className="size-4 shrink-0" />
            </InputGroupAddon>
          </EditableName>
        ) : (
          <>
            <Icon className="size-4 shrink-0" />
            <span className="truncate grow">{pluralize(label, selected.length)}</span>
          </>
        )}
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

/** The edge counterpart of `InspectorHeader`: edges have no name to edit. */
function EdgeHeader({ count }: { count: number }) {
  return (
    <SidebarHeader>
      <div className="flex items-center gap-2">
        <CableIcon className="size-4 shrink-0" />
        <span className="truncate grow">{pluralize("edge", count)}</span>
      </div>
    </SidebarHeader>
  );
}

function MultiEdgeSelection({ selected }: { selected: GraphEdge[] }) {
  const counts: Partial<Record<EdgeKind, number>> = {};
  for (const edge of selected) counts[edge.kind] = (counts[edge.kind] ?? 0) + 1;

  return (
    <div className="flex flex-col gap-2 p-4">
      <h2 className="text-sm font-medium">{selected.length} selected</h2>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        {Object.entries(counts).map(([kind, count]) => (
          <li key={kind}>
            {count} {kind}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GraphInspector({
  selected,
  selectedEdges,
  editing,
  className,
}: GraphInspectorProps) {
  const [node] = selected;
  const [edge] = selectedEdges;
  if (!node && !edge) return null;

  return (
    <InspectorProvider>
      <aside
        // `nokey` is React Flow's own escape hatch: keys pressed in here are the
        // panel's, not the canvas's (#37).
        className={cn("nokey display-contents pointer-events-auto", className)}
        aria-label="Inspector"
      >
        {node ? (
          <>
            <InspectorHeader selected={selected} editing={editing} />
            {selected.length > 1 ? (
              <MultiSelection selected={selected} />
            ) : (
              <SingleNode node={node} editing={editing} />
            )}
          </>
        ) : (
          <>
            <EdgeHeader count={selectedEdges.length} />
            {selectedEdges.length > 1 || !edge ? (
              <MultiEdgeSelection selected={selectedEdges} />
            ) : (
              <SingleEdge edge={edge} graph={editing.graph} />
            )}
          </>
        )}
      </aside>
    </InspectorProvider>
  );
}
