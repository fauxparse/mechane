import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mechane/design-system";
import { DEFAULT_FLOW_COLOR, FLOW_COLORS, isFlowColor } from "@mechane/domain";
import type { FlowColor, FlowNode } from "@mechane/domain";

import type { GraphEditing } from "../commands/use-graph-editing";

export function FlowColorField({ flow, editing }: { flow: FlowNode; editing: GraphEditing }) {
  const value = flow.color ?? DEFAULT_FLOW_COLOR;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="inspector-flow-color">Color</Label>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next && isFlowColor(next)) editing.setFlowColor(flow.id, next);
        }}
      >
        <SelectTrigger id="inspector-flow-color" size="sm" aria-label="Flow color">
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
