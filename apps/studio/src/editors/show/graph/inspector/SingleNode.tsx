import {
  Button,
  CopyButton,
  Input,
  Section,
  SectionHelperText,
  SectionRow,
  SidebarContent,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from "@mechane/design-system";
import { FLOW_COLORS, type Cue, type FlowColor, type GraphNode } from "@mechane/domain";
import { useEffect, useState } from "react";

import type { GraphInspectorEditing } from "../../commands/use-graph-editing";
import { SourceValues } from "./SourceValues";
import { SourceTypeSection } from "./SourceTypeSection";
import { Variables } from "./Variables";

function CueRow({ cue, editing }: { cue: Cue; editing: GraphInspectorEditing }) {
  const [name, setName] = useState(cue.name);
  useEffect(() => setName(cue.name), [cue.name]);
  return (
    <SectionRow className="grid-cols-[1fr_auto] items-center">
      <Input
        aria-label={`Cue name for ${cue.name}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          if (name !== cue.name) editing.renameCue(cue.id, name);
        }}
      />
      <span className="text-xs text-muted-foreground">
        {cue.actionIds.length} {cue.actionIds.length === 1 ? "Action" : "Actions"}
      </span>
    </SectionRow>
  );
}

function CueSection({ node, editing }: { node: GraphNode; editing: GraphInspectorEditing }) {
  if (node.kind !== "scene") return null;
  const cues = (editing.graph.cues ?? []).filter(
    (cue) => cue.owner.kind === "scene" && cue.owner.sceneId === node.id,
  );
  return (
    <Section
      label="Cues"
      buttons={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => editing.addCue({ kind: "scene", sceneId: node.id })}
        >
          New
        </Button>
      }
    >
      {cues.length === 0 ? (
        <SectionHelperText>
          No Cues yet. Add one to give an Element a tap behavior.
        </SectionHelperText>
      ) : (
        cues.map((cue) => <CueRow key={cue.id} cue={cue} editing={editing} />)
      )}
    </Section>
  );
}

export function SingleNode({ node, editing }: { node: GraphNode; editing: GraphInspectorEditing }) {
  return (
    <SidebarContent>
      <Section label="color">
        <SectionRow>
          <ToggleGroup
            className="col-span-full bg-transparent flex w-full justify-between"
            value={node.color ? [node.color] : ["neutral"]}
            onValueChange={([value]) => {
              if (value) {
                editing.setNodeColor(node.id, value as FlowColor);
              }
            }}
          >
            {FLOW_COLORS.map((color) => (
              <ToggleGroupItem key={color} value={color} className="p-1 rounded-full! grow-0!">
                <span
                  className="inline-block size-4 rounded-full"
                  style={{
                    backgroundColor:
                      color === "neutral"
                        ? "var(--palette-neutral-500)"
                        : `var(--palette-${color}-500)`,
                  }}
                />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </SectionRow>
      </Section>

      {node.kind === "device" && (
        <>
          <Section label="Device settings">
            <SectionRow>
              <label className="col-span-2 flex items-center gap-2">
                <Switch
                  checked={node.perConnection}
                  onCheckedChange={(checked) => {
                    if (typeof checked === "boolean") {
                      editing.setDevicePerConnection(node.id, checked);
                    }
                  }}
                />
                <span>Individual devices</span>
              </label>
              <SectionHelperText>
                {node.perConnection
                  ? "Every device joins independently. Good for audience phones."
                  : "Everything that joins sees the same thing. Good for projectors and laptops."}
              </SectionHelperText>
            </SectionRow>
          </Section>
          {node.pairingCode && (
            <Section label="pairing code">
              <SectionRow>
                <div className="col-span-2 flex items-center gap-2">
                  <div className="col-span-2 text-2xl font-mono tracking-widest">
                    {node.pairingCode}
                  </div>
                  <CopyButton value={node.pairingCode} />
                </div>
              </SectionRow>
              <SectionHelperText>
                {node.perConnection
                  ? "Give this code to your audience to join the session."
                  : "Enter this code on each device you want to connect."}
              </SectionHelperText>
            </Section>
          )}
        </>
      )}

      {node.kind === "scene" ? (
        <Variables node={node} editing={editing} shapes={editing.graph.shapes ?? []} />
      ) : null}
      <CueSection node={node} editing={editing} />
      {node.kind === "source" ? (
        <>
          <SourceTypeSection node={node} editing={editing} />
          <SourceValues node={node} editing={editing} />
        </>
      ) : null}
      {node.kind === "transformer" ? (
        <p className="text-xs text-muted-foreground">
          Expressions arrive with the Transformer slice — they evaluate server-side (ADR-0004), so
          there's nothing to type here yet.
        </p>
      ) : null}
    </SidebarContent>
  );
}
