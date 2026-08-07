// The side inspector (issue #42, per #27 and #36).
//
// #27 puts "fuller property editing" here, mirroring PRD §6.1's property
// inspector: the node's name, and for a Scene its Variables — which are the
// ports a wiring edge lands on (#20), so a Scene with none can't be wired at
// all and this is where that's fixed.
//
// Two decisions worth not re-litigating:
//
//   - **With a multi-selection it shows a count and a type breakdown, and no
//     editing** (#36). Multi-edit semantics for Transformer expressions were
//     never scoped and nobody asked for them; an empty panel would waste a
//     surface that can usefully confirm what you're about to delete.
//   - **Transformer expressions and Shape assignment are not here yet.** Both
//     need model that doesn't exist (ADR-0004's JEXL subset; PRD §10 defers
//     the Shape schema), so the panel says so rather than shipping a field
//     that writes nowhere.
import { Button, cn, Input, Label, QrCode } from "@mechane/design-system";
import type { DeviceNode, GraphNode, SceneNode } from "@mechane/domain";
import { Check, Copy, Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { nodeIcon, NODE_KIND_META } from "./node-kinds";
import type { GraphEditing } from "../commands/use-graph-editing";

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

/** #36: confirm what you have, don't invent multi-edit. */
function MultiSelection({ selected }: { selected: GraphNode[] }) {
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
}

function SingleNode({ node, editing }: { node: GraphNode; editing: GraphEditing }) {
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

/**
 * How a physical device joins this one (#45): the code, the same code as a
 * QR, and a plain statement of what kind of Device it is.
 *
 * Nothing here is editable. The code is the server's to mint, and
 * `perConnection` is fixed at creation because it decides Event
 * attribution — a control that looks editable would promise a change the
 * model deliberately doesn't allow.
 */
function DevicePairing({ device }: { device: DeviceNode }) {
  const [copied, setCopied] = useState(false);
  const code = device.pairingCode;

  const copy = useCallback(() => {
    if (!code) return;
    void navigator.clipboard.writeText(code).then(() => setCopied(true));
  }, [code]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>Pairing code</Label>
        {code ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg tracking-widest">{code}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={copy}
              aria-label={`Copy pairing code ${code}`}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        ) : (
          // The gap between creating a Device and the first save landing:
          // ids are the client's, codes are the server's (#45).
          <p className="text-xs text-muted-foreground">Assigned when the Show is saved.</p>
        )}
      </div>

      {code ? (
        <div className="flex flex-col gap-1.5">
          <Label>QR</Label>
          <QrCode value={code} className="size-40" label={`QR code for pairing code ${code}`} />
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {device.perConnection
          ? "Every phone that joins is its own instance, navigating independently. Events are anonymous."
          : "Everything that joins sees the same thing, and its Events count as this Device's."}
      </p>
    </div>
  );
}

/**
 * A Scene's Variables. Editable here because they're the Scene's own ports
 * (#20) — and because a Scene with no Variables has nothing for a wiring edge
 * to land on, which makes this the surface that unblocks wiring a new Scene.
 */
function SceneVariables({ scene, editing }: { scene: SceneNode; editing: GraphEditing }) {
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
