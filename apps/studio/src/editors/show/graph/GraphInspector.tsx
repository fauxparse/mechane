import { cn } from "@mechane/design-system";
import type { GraphNode } from "@mechane/domain";

import type { GraphEditing } from "../commands/use-graph-editing";
import { MultiSelection } from "./MultiSelection";
import { SingleNode } from "./SingleNode";

export interface GraphInspectorProps {
  /** The selected nodes, in graph order. */
  selected: GraphNode[];
  editing: GraphEditing;
  className?: string;
}

export function GraphInspector({ selected, editing, className }: GraphInspectorProps) {
  if (selected.length === 0) return null;

  return (
    <aside
      // `nokey` is React Flow's own escape hatch: keys pressed in here are the
      // panel's, not the canvas's (#37).
      className={cn(
        "nokey pointer-events-auto flex w-72 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur",
        className,
      )}
      aria-label="Inspector"
    >
      {selected.length > 1 ? (
        <MultiSelection selected={selected} />
      ) : (
        <SingleNode node={selected[0] as GraphNode} editing={editing} />
      )}
    </aside>
  );
}
