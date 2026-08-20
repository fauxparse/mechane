import { Button, Input, Label, Plus, X } from "@mechane/design-system";
import type { SceneNode } from "@mechane/domain";

import type { GraphEditing } from "../commands/use-graph-editing";

/**
 * A Scene's Variables. Editable here because they're the Scene's own ports
 * (#20) — and because a Scene with no Variables has nothing for a wiring edge
 * to land on, which makes this the surface that unblocks wiring a new Scene.
 */
export function SceneVariables({ scene, editing }: { scene: SceneNode; editing: GraphEditing }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Variables</Label>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => editing.addVariable(scene.id)}
          aria-label="Add Variable"
        >
          <Plus />
        </Button>
      </div>

      {scene.variables.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          None yet. A Variable is what a Source or Transformer wires into.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {scene.variables.map((variable) => (
            <li key={variable.id} className="flex items-center gap-1">
              <Input
                value={variable.name}
                aria-label={`Variable name: ${variable.name}`}
                onChange={(event) =>
                  editing.renameVariable(scene.id, variable.id, event.target.value)
                }
              />
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete ${variable.name}`}
                onClick={() => editing.removeVariable(scene.id, variable.id)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
