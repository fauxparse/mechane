import { cn } from "@mechane/design-system";
import type { GraphNode } from "@mechane/domain";
import { GraphEditing } from "@show-editor/commands/use-graph-editing";
import { MultiSelection } from "@show-editor/graph/inspector/MultiSelection";
import { SingleNode } from "@show-editor/graph/inspector/SingleNode";
import { Header } from "./Header";

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
      className={cn("nokey display-contents pointer-events-auto", className)}
      aria-label="Inspector"
    >
      <Header selected={selected} />
      {selected.length > 1 ? (
        <MultiSelection selected={selected} />
      ) : (
        <SingleNode node={selected[0] as GraphNode} editing={editing} />
      )}
    </aside>
  );
}
