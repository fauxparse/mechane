import { NODE_KIND_META } from "../node-kinds";
import type { GraphNode } from "@mechane/domain";

export const MultiSelection = ({ selected }: { selected: GraphNode[] }) => {
  const counts = new Map<string, number>();
  for (const node of selected) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{selected.length} selected</h2>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        {[...counts].map(([kind, count]) => (
          <li key={kind}>
            {count}{" "}
            {count === 1
              ? NODE_KIND_META[kind as GraphNode["kind"]].label
              : `${NODE_KIND_META[kind as GraphNode["kind"]].label}s`}
          </li>
        ))}
      </ul>
    </div>
  );
};
