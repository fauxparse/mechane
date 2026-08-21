import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mechane/design-system";
import { DEFAULT_FLOW_COLOR, FLOW_COLORS, isFlowColor } from "@mechane/domain";
import type { FlowColor, GraphNode } from "@mechane/domain";

import type { GraphEditing } from "../commands/use-graph-editing";

export function NodeColorField({ node, editing }: { node: GraphNode; editing: GraphEditing }) {
  const value = node.color ?? DEFAULT_FLOW_COLOR;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="inspector-node-color">Color</Label>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next && isFlowColor(next)) editing.setNodeColor(node.id, next);
        }}
      >
        <SelectTrigger id="inspector-node-color" size="sm" aria-label="Node color">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FLOW_COLORS.map((color: FlowColor) => (
            <SelectItem key={color} value={color}>
              <span
                className="mr-2 inline-block size-2 rounded-full"
                style={{
                  backgroundColor:
                    color === "neutral"
                      ? "var(--palette-neutral-500)"
                      : `var(--palette-${color}-500)`,
                }}
              />
              {color[0]?.toUpperCase()}
              {color.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
