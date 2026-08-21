import {
  CopyButton,
  Input,
  Label,
  Section,
  SectionHelperText,
  SectionRow,
  SidebarContent,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from "@mechane/design-system";
import { FLOW_COLORS, FlowColor, type GraphNode } from "@mechane/domain";
import type { GraphEditing } from "../../commands/use-graph-editing";
import { Variables } from "./Variables";

export function SingleNode({ node, editing }: { node: GraphNode; editing: GraphEditing }) {
  return (
    <SidebarContent className="p-0">
      <Section label="color">
        <SectionRow>
          <ToggleGroup
            size="sm"
            className="col-span-2 bg-transparent"
            value={node.color ? [node.color] : ["neutral"]}
            onValueChange={([value]) => {
              if (value) {
                editing.setNodeColor(node.id, value as FlowColor);
              }
            }}
          >
            {FLOW_COLORS.map((color) => (
              <ToggleGroupItem key={color} value={color} className="p-1 rounded-full!">
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

      {node.kind === "scene" ? <Variables node={node} editing={editing} /> : null}

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
    </SidebarContent>
  );
}
