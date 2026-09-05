/**
 * PROTOTYPE — throwaway. Not production code.
 *
 * VARIANT B — "One document, both editors".
 *
 * The whole route is one object. A single Interaction panel renders it as a
 * numbered top-to-bottom pipeline, every link editable inline, and appears
 * identically in the Canvas Editor and the Show Editor. Each step is tagged
 * with the editor that owns it, so ownership is still visible — but you never
 * have to travel to it to see or change the route.
 *
 * Default/Current take: one value row with a Draft/Live segmented toggle,
 * so there is a single place a value is edited and the toggle says which
 * value you are editing.
 */
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  ToggleGroup,
  ToggleGroupItem,
  ZapIcon,
} from "@mechane/design-system";
import { useState } from "react";

import {
  FIELDS_BY_SOURCE,
  type PrototypeState,
  SOURCES,
  operandLabel,
  targetLabel,
} from "./data";
import { PrototypeChrome, PrototypePanel } from "./PrototypeSwitcher";

const str = (value: unknown) => String(value ?? "");

function Step({
  index,
  owner,
  title,
  children,
}: {
  index: number;
  owner: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative pl-8">
      <div className="absolute top-0 left-0 flex size-5 items-center justify-center rounded-full bg-foreground text-[10px] font-medium text-background">
        {index}
      </div>
      <div className="absolute top-6 bottom-0 left-2.5 w-px bg-border last:hidden" />
      <div className="pb-5">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium">{title}</span>
          <span className="text-[10px] whitespace-nowrap text-muted-foreground">{owner}</span>
        </div>
        <div className="space-y-1.5">{children}</div>
      </div>
    </div>
  );
}

export function VariantB({
  state,
  set,
}: {
  state: PrototypeState;
  set: (patch: Partial<PrototypeState>) => void;
}) {
  const [valueMode, setValueMode] = useState<"draft" | "live">("live");
  const fields = FIELDS_BY_SOURCE[state.targetSourceId] ?? [];
  const editingLive = valueMode === "live" && state.runActive;

  return (
    <PrototypeChrome
      surface={
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Variant B — One document</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            The route is a single editable object. This same panel appears in both editors, so
            wherever you found the interaction, you see all of it. Ownership survives as a label,
            not as a place you have to travel to.
          </p>
          <div className="max-w-xl rounded-md border border-dashed border-border p-4 text-sm">
            <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Resulting behaviour
            </div>
            Tapping a candidate sets <strong>{targetLabel(state)}</strong> to{" "}
            <strong>{operandLabel(state)}</strong>.
          </div>
        </div>
      }
      panels={
        <>
          <PrototypePanel title="Interaction" subtitle="Tap → Current candidate">
            <div className="p-4">
              <Step index={1} owner="Candidate Block" title="Element event">
                <Select value={state.elementEventKind} onValueChange={() => {}}>
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tap">Tap</SelectItem>
                    <SelectItem value="keypress">Key press</SelectItem>
                  </SelectContent>
                </Select>
              </Step>

              <Step index={2} owner="Candidate Block" title="Block Cue">
                <div className="flex items-center gap-1.5">
                  <ZapIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <Input
                    aria-label="Block Cue name"
                    value={state.blockCueName}
                    onChange={(event) => set({ blockCueName: event.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    aria-label="Block Cue parameter name"
                    value={state.blockCueParamName}
                    onChange={(event) => set({ blockCueParamName: event.target.value })}
                  />
                  <Badge variant="secondary">Candidate</Badge>
                </div>
              </Step>

              <Step index={3} owner="Vote Scene · candidates Slot" title="Relay">
                <div className="rounded border border-border px-2 py-1 text-sm text-muted-foreground">
                  {state.blockCueParamName} → {state.sceneCueParamName}
                </div>
              </Step>

              <Step index={4} owner="Vote Scene" title="Scene Cue">
                <div className="flex items-center gap-1.5">
                  <ZapIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <Input
                    aria-label="Scene Cue name"
                    value={state.sceneCueName}
                    onChange={(event) => set({ sceneCueName: event.target.value })}
                  />
                </div>
              </Step>

              <Step index={5} owner="Vote Scene" title="Update Action">
                <Select
                  value={state.operation}
                  onValueChange={(value) => set({ operation: str(value) as PrototypeState["operation"] })}
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="set">Set</SelectItem>
                    <SelectItem value="adjust">Adjust</SelectItem>
                    <SelectItem value="reset">Reset</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={state.targetSourceId}
                  onValueChange={(value) => set({ targetSourceId: str(value), targetFieldPath: [] })}
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((source) => (
                      <SelectItem key={source.id} value={source.id}>
                        {source.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                {state.operation === "reset" ? (
                  <div className="text-xs text-muted-foreground">
                    Restores the published default. No operand.
                  </div>
                ) : (
                  <Select
                    value={state.operandRef}
                    onValueChange={(value) => set({ operandKind: "parameter", operandRef: str(value) })}
                  >
                    <SelectTrigger size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={state.sceneCueParamName}>
                        {state.sceneCueParamName} (from step 3)
                      </SelectItem>
                      <SelectItem value="round">round (Scene Variable)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </Step>
            </div>
          </PrototypePanel>

          <PrototypePanel title="Current candidate" subtitle="Source">
            <div className="space-y-3 p-4">
              <ToggleGroup
                value={[valueMode]}
                onValueChange={([next]) => {
                  if (next) setValueMode(next as "draft" | "live");
                }}
                className="w-full"
              >
                <ToggleGroupItem value="draft" className="flex-1 text-xs">
                  Draft default
                </ToggleGroupItem>
                <ToggleGroupItem value="live" className="flex-1 text-xs" disabled={!state.runActive}>
                  Live value
                </ToggleGroupItem>
              </ToggleGroup>

              <Input
                aria-label={editingLive ? "Current value" : "Default value"}
                value={editingLive ? state.currentValue : state.defaultValue}
                onChange={(event) =>
                  set(
                    editingLive
                      ? { currentValue: event.target.value }
                      : { defaultValue: event.target.value },
                  )
                }
              />

              <p className="text-xs text-muted-foreground">
                {editingLive
                  ? "Writes live Run state immediately. Does not publish or change the default."
                  : "Applies to future Runs and to explicit resets after publication."}
              </p>

              <Separator />

              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!state.runActive}
                  onClick={() => set({ currentValue: state.defaultValue })}
                >
                  Reset live value to default
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!state.runActive}
                  onClick={() => set({ defaultValue: state.currentValue })}
                >
                  Set current and default
                </Button>
              </div>

              <div className="rounded border border-border bg-muted/40 p-2 text-[11px] text-muted-foreground">
                <div>Default: {state.defaultValue}</div>
                <div>Live: {state.runActive ? state.currentValue : "no active Run"}</div>
              </div>
            </div>
          </PrototypePanel>
        </>
      }
    />
  );
}
