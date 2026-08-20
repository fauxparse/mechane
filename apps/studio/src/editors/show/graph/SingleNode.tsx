import { Input, Label } from "@mechane/design-system";
import type { GraphNode } from "@mechane/domain";

import type { GraphEditing } from "../commands/use-graph-editing";
import { DevicePairing } from "./DevicePairing";
import { FlowColorField } from "./FlowColorField";
import { NODE_KIND_META, nodeIcon } from "./node-kinds";
import { SceneVariables } from "./SceneVariables";

export function SingleNode({ node, editing }: { node: GraphNode; editing: GraphEditing }) {
  const meta = NODE_KIND_META[node.kind];
  // An Audience Device is a Device, but calling it one here would hide the
  // distinction the director chose at creation and can't change (#45).
  const perConnection = node.kind === "device" && node.perConnection;
  const Icon = nodeIcon(node.kind, { perConnection });
  const label = perConnection ? "Audience" : meta.label;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-medium">{label}</h2>
      </div>

      {node.kind === "flow" ? <FlowColorField flow={node} editing={editing} /> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="inspector-name">Name</Label>
        <Input
          id="inspector-name"
          value={node.name}
          // The same command a double-click rename runs, coalesced the same way
          // — so a name typed here is one undo entry, not one per keystroke.
          onChange={(event) => {
            editing.beginRename(node.id);
            editing.renameTo(event.target.value);
          }}
          onBlur={editing.commitRename}
        />
      </div>

      {node.kind === "scene" ? <SceneVariables scene={node} editing={editing} /> : null}

      {node.kind === "transformer" ? (
        <p className="text-xs text-muted-foreground">
          Expressions arrive with the Transformer slice — they evaluate server-side (ADR-0004), so
          there's nothing to type here yet.
        </p>
      ) : null}

      {node.kind === "source" ? (
        <p className="text-xs text-muted-foreground">
          Shapes and default values arrive with the Source slice.
        </p>
      ) : null}

      {node.kind === "device" ? <DevicePairing device={node} /> : null}
    </div>
  );
}
