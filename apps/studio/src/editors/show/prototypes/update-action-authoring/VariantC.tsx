/**
 * PROTOTYPE — throwaway. Not production code.
 *
 * VARIANT C — "Graph gesture".
 *
 * Extends the idiom the editor already uses for Navigate: drag a Cue's handle
 * onto a Source node's Field handle and the Update Action exists. The projected
 * `update:<action-id>` edge is the primary object — you select the edge, not a
 * list row — and the relay chain rides on the edge as decoration rather than
 * being authored anywhere new. (The mini-canvas here is hand-drawn divs, not
 * React Flow; it only has to be clickable.)
 *
 * Default/Current take: the live value is shown on the Source node itself while
 * a Run is active, and editing it is a popover off the node rather than a
 * separate inspector section.
 */
import {
  Badge,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Section,
  SectionHelperText,
  SectionRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ZapIcon,
} from "@mechane/design-system";
import { useState } from "react";

import { FIELDS_BY_SOURCE, type PrototypeState, operandLabel, targetLabel } from "./data";
import { PrototypeChrome, PrototypePanel } from "./PrototypeSwitcher";

const str = (value: unknown) => String(value ?? "");

function GraphNode({
  title,
  kind,
  selected,
  children,
  onClick,
}: {
  title: string;
  kind: string;
  selected?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-60 rounded-md border bg-card p-0 text-left shadow-sm transition ${
        selected ? "border-foreground ring-2 ring-foreground/20" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-[10px] tracking-wide text-muted-foreground uppercase">{kind}</span>
      </div>
      {children ? <div className="px-3 py-2">{children}</div> : null}
    </button>
  );
}

export function VariantC({
  state,
  set,
}: {
  state: PrototypeState;
  set: (patch: Partial<PrototypeState>) => void;
}) {
  const [selection, setSelection] = useState<"edge" | "scene" | "source">("edge");
  const fields = FIELDS_BY_SOURCE[state.targetSourceId] ?? [];

  return (
    <PrototypeChrome
      surface={
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-medium">Variant C — Graph gesture</h2>
            <p className="max-w-xl text-sm text-muted-foreground">
              Same idiom as Navigate: drag the Cue handle onto a Source field to author the Action.
              The edge <em>is</em> the Action. Click it to edit; the relay chain is a label on the
              edge, not a form.
            </p>
          </div>

          <div className="flex items-center gap-6">
            <GraphNode
              title="Vote Scene"
              kind="scene"
              selected={selection === "scene"}
              onClick={() => setSelection("scene")}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <ZapIcon className="size-3" />
                  {state.sceneCueName}
                </span>
                <span className="size-2 rounded-full bg-foreground" aria-hidden />
              </div>
            </GraphNode>

            <button
              type="button"
              onClick={() => setSelection("edge")}
              className="group flex flex-col items-center"
              aria-label="Update edge"
            >
              <span
                className={`text-[10px] whitespace-nowrap ${
                  selection === "edge" ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                {state.operation} · via candidates › {state.blockCueName}
              </span>
              <span
                className={`h-px w-28 ${
                  selection === "edge" ? "bg-foreground" : "bg-border group-hover:bg-foreground/50"
                }`}
              />
            </button>

            <GraphNode
              title="Current candidate"
              kind="source"
              selected={selection === "source"}
              onClick={() => setSelection("source")}
            >
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="size-2 rounded-full bg-foreground" aria-hidden />
                  <span className="text-muted-foreground">name</span>
                </div>
                {state.runActive ? (
                  <div className="flex items-center justify-between gap-2 rounded bg-muted/60 px-1.5 py-1">
                    <span className="truncate font-medium">{state.currentValue}</span>
                    <Badge className="shrink-0 text-[9px]">live</Badge>
                  </div>
                ) : (
                  <div className="text-muted-foreground">{state.defaultValue}</div>
                )}
              </div>
            </GraphNode>
          </div>

          <div className="max-w-xl rounded-md border border-dashed border-border p-4 text-sm">
            <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Resulting behaviour
            </div>
            Tapping a candidate sets <strong>{targetLabel(state)}</strong> to{" "}
            <strong>{operandLabel(state)}</strong>.
          </div>

          {state.runActive ? (
            <Popover>
              <PopoverTrigger
                render={
                  <Button size="sm" variant="outline">
                    Edit live value
                  </Button>
                }
              />
              <PopoverContent className="w-72 space-y-3 p-3">
                <div className="text-xs font-medium">Current candidate · live value</div>
                <Input
                  aria-label="Current value"
                  value={state.currentValue}
                  onChange={(event) => set({ currentValue: event.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">
                  Writes Run state now. The published default stays {state.defaultValue}.
                </p>
                <div className="flex flex-col gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => set({ currentValue: state.defaultValue })}
                  >
                    Reset to default
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => set({ defaultValue: state.currentValue })}
                  >
                    Set current and default
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      }
      panels={
        <PrototypePanel
          title={
            selection === "edge"
              ? "Update Action"
              : selection === "scene"
                ? "Vote Scene"
                : "Current candidate"
          }
          subtitle={selection === "edge" ? "Selected edge" : "Selected node"}
        >
          {selection === "edge" ? (
            <>
              <Section label="Action">
                <SectionRow className="grid-cols-[auto_1fr] items-center">
                  <span className="text-xs text-muted-foreground">Do</span>
                  <Select
                    value={state.operation}
                    onValueChange={(value) =>
                      set({ operation: str(value) as PrototypeState["operation"] })
                    }
                  >
                    <SelectTrigger size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="set">Set to</SelectItem>
                      <SelectItem value="adjust">Adjust by</SelectItem>
                      <SelectItem value="reset">Reset to default</SelectItem>
                    </SelectContent>
                  </Select>
                </SectionRow>
                <SectionRow className="grid-cols-[auto_1fr] items-center">
                  <span className="text-xs text-muted-foreground">Field</span>
                  <Select
                    value={state.targetFieldPath.join(".")}
                    onValueChange={(value) =>
                      set({ targetFieldPath: str(value) === "" ? [] : str(value).split(".") })
                    }
                  >
                    <SelectTrigger size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fields.map((field) => (
                        <SelectItem key={field.path.join(".")} value={field.path.join(".")}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SectionRow>
                {state.operation === "reset" ? (
                  <SectionHelperText>Restores the published default. No operand.</SectionHelperText>
                ) : (
                  <SectionRow className="grid-cols-[auto_1fr] items-center">
                    <span className="text-xs text-muted-foreground">Value</span>
                    <Select
                      value={state.operandRef}
                      onValueChange={(value) => set({ operandKind: "parameter", operandRef: str(value) })}
                    >
                      <SelectTrigger size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={state.sceneCueParamName}>
                          {state.sceneCueParamName} (Cue Parameter)
                        </SelectItem>
                        <SelectItem value="round">round (Scene Variable)</SelectItem>
                      </SelectContent>
                    </Select>
                  </SectionRow>
                )}
              </Section>

              <Section label="Invoked by">
                <SectionHelperText className="col-span-full">
                  Tap on Candidate → <strong>{state.blockCueName}</strong> → candidates Slot →{" "}
                  <strong>{state.sceneCueName}</strong>
                </SectionHelperText>
                <SectionRow className="grid-cols-[1fr]">
                  <Button size="sm" variant="outline">
                    Open in Canvas Editor
                  </Button>
                </SectionRow>
                <SectionHelperText>
                  The relay is authored where it lives. This edge only shows it.
                </SectionHelperText>
              </Section>
            </>
          ) : selection === "scene" ? (
            <Section label="Cues">
              <SectionRow className="grid-cols-[1fr_auto] items-center">
                <Input
                  aria-label="Scene Cue name"
                  value={state.sceneCueName}
                  onChange={(event) => set({ sceneCueName: event.target.value })}
                />
                <span className="text-xs text-muted-foreground">1 Action</span>
              </SectionRow>
              <SectionHelperText>
                Drag a Cue's handle onto a Source field to add an Update Action.
              </SectionHelperText>
            </Section>
          ) : (
            <Section label="Default value">
              <SectionRow className="grid-cols-[1fr]">
                <Input
                  aria-label="Default value"
                  value={state.defaultValue}
                  onChange={(event) => set({ defaultValue: event.target.value })}
                />
              </SectionRow>
              <SectionHelperText>
                The live value is on the node, not here — edit it from the canvas.
              </SectionHelperText>
            </Section>
          )}
        </PrototypePanel>
      }
    />
  );
}
