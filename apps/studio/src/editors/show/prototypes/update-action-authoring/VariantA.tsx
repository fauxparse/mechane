/**
 * PROTOTYPE — throwaway. Not production code.
 *
 * VARIANT A — "Owned in place".
 *
 * Status quo extended. Each link of the route is edited on the inspector of
 * whatever owns it: the Block Cue and Element binding in the Canvas Editor,
 * the Slot Event Binding on the Slot, the Update Action in the Show Editor's
 * Cue section. Every panel carries a read-only breadcrumb of the whole route
 * with its own link highlighted, so you can see where you are without seeing
 * the rest. Both panels are shown side by side here only so the prototype is
 * clickable; in the real app you would be looking at one at a time.
 *
 * Default/Current take: two stacked Sections in the Source inspector.
 */
import {
  Badge,
  Button,
  Input,
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

import {
  CHAIN,
  type ChainKey,
  FIELDS_BY_SOURCE,
  type PrototypeState,
  SOURCES,
  operandLabel,
  targetLabel,
} from "./data";
import { PrototypeChrome, PrototypePanel } from "./PrototypeSwitcher";

const str = (value: unknown) => String(value ?? "");

function Breadcrumb({ active }: { active: readonly ChainKey[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-sidebar-border bg-muted/40 px-4 py-2 text-[11px] leading-tight">
      {CHAIN.map((link, index) => (
        <span key={link.key} className="flex items-center gap-1">
          {index > 0 ? <span className="text-muted-foreground/50">›</span> : null}
          <span
            className={
              active.includes(link.key)
                ? "rounded bg-foreground px-1.5 py-0.5 font-medium text-background"
                : "px-1 py-0.5 text-muted-foreground"
            }
          >
            {link.label}
          </span>
        </span>
      ))}
    </div>
  );
}

export function VariantA({
  state,
  set,
}: {
  state: PrototypeState;
  set: (patch: Partial<PrototypeState>) => void;
}) {
  const fields = FIELDS_BY_SOURCE[state.targetSourceId] ?? [];
  const fieldKey = state.targetFieldPath.join(".");

  return (
    <PrototypeChrome
      surface={
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Variant A — Owned in place</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Each link is edited where it is owned. The two panels on the right are two{" "}
            <em>different editors</em>; today you would have to navigate between them. The
            breadcrumb is the only thing that tells you they are one route.
          </p>
          <div className="max-w-xl rounded-md border border-dashed border-border p-4 text-sm">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Resulting behaviour
            </div>
            Tapping a candidate sets <strong>{targetLabel(state)}</strong> to{" "}
            <strong>{operandLabel(state)}</strong>.
          </div>
        </div>
      }
      panels={
        <>
          <PrototypePanel title="Candidate Block" subtitle="Canvas Editor">
            <Breadcrumb active={["element", "blockCue"]} />

            <Section label="Interactions">
              <SectionRow className="grid-cols-[auto_1fr] items-center">
                <span className="text-xs text-muted-foreground">On</span>
                <Select value={state.elementEventKind} onValueChange={() => {}}>
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tap">Tap</SelectItem>
                    <SelectItem value="keypress">Key press</SelectItem>
                  </SelectContent>
                </Select>
              </SectionRow>
              <SectionRow className="grid-cols-[auto_1fr] items-center">
                <span className="text-xs text-muted-foreground">Then</span>
                <div className="flex items-center gap-1.5 rounded border border-border px-2 py-1 text-sm">
                  <ZapIcon className="size-3.5 text-muted-foreground" />
                  {state.blockCueName}
                </div>
              </SectionRow>
            </Section>

            <Section label="Block Cues" buttons={<Button size="sm" variant="ghost">New</Button>}>
              <SectionRow className="grid-cols-[1fr]">
                <Input
                  aria-label="Block Cue name"
                  value={state.blockCueName}
                  onChange={(event) => set({ blockCueName: event.target.value })}
                />
              </SectionRow>
              <SectionRow className="grid-cols-[1fr_auto] items-center">
                <Input
                  aria-label="Block Cue parameter name"
                  value={state.blockCueParamName}
                  onChange={(event) => set({ blockCueParamName: event.target.value })}
                />
                <Badge variant="secondary">Candidate</Badge>
              </SectionRow>
              <SectionHelperText>
                Block Cues carry no Actions. They are typed outputs a Slot can relay.
              </SectionHelperText>
            </Section>
          </PrototypePanel>

          <PrototypePanel title="Vote Scene" subtitle="Show Editor">
            <Breadcrumb active={["slot", "sceneCue", "action"]} />

            <Section label="Slot relay">
              <SectionRow className="grid-cols-[auto_1fr] items-center">
                <span className="text-xs text-muted-foreground">When</span>
                <div className="rounded border border-border px-2 py-1 text-sm">
                  candidates › {state.blockCueName}
                </div>
              </SectionRow>
              <SectionRow className="grid-cols-[auto_1fr] items-center">
                <span className="text-xs text-muted-foreground">Call</span>
                <div className="rounded border border-border px-2 py-1 text-sm">
                  {state.sceneCueName}
                </div>
              </SectionRow>
              <SectionHelperText>
                {state.slotParamMapping} → {state.sceneCueParamName}
              </SectionHelperText>
            </Section>

            <Section label="Cues" buttons={<Button size="sm" variant="ghost">New</Button>}>
              <SectionRow className="grid-cols-[1fr_auto] items-center">
                <Input
                  aria-label="Scene Cue name"
                  value={state.sceneCueName}
                  onChange={(event) => set({ sceneCueName: event.target.value })}
                />
                <span className="text-xs text-muted-foreground">1 Action</span>
              </SectionRow>
            </Section>

            <Section label="Update Action">
              <SectionRow className="grid-cols-[auto_1fr] items-center">
                <span className="text-xs text-muted-foreground">Source</span>
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
              </SectionRow>
              <SectionRow className="grid-cols-[auto_1fr] items-center">
                <span className="text-xs text-muted-foreground">Field</span>
                <Select
                  value={fieldKey}
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
              <SectionRow className="grid-cols-[auto_1fr] items-center">
                <span className="text-xs text-muted-foreground">Do</span>
                <Select
                  value={state.operation}
                  onValueChange={(value) => set({ operation: str(value) as PrototypeState["operation"] })}
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
          </PrototypePanel>

          <PrototypePanel title="Current candidate" subtitle="Show Editor · Source">
            <Section label="Default value">
              <SectionRow className="grid-cols-[1fr]">
                <Input
                  aria-label="Default value"
                  value={state.defaultValue}
                  onChange={(event) => set({ defaultValue: event.target.value })}
                />
              </SectionRow>
              <SectionHelperText>
                Applies to future Runs and to explicit resets after publication.
              </SectionHelperText>
            </Section>

            <Section
              label={
                <span className="flex items-center gap-2">
                  Current value
                  {state.runActive ? <Badge>Run active</Badge> : null}
                </span>
              }
            >
              {state.runActive ? (
                <>
                  <SectionRow className="grid-cols-[1fr]">
                    <Input
                      aria-label="Current value"
                      value={state.currentValue}
                      onChange={(event) => set({ currentValue: event.target.value })}
                    />
                  </SectionRow>
                  <SectionRow className="grid-cols-[1fr_1fr]">
                    <Button size="sm" variant="outline" onClick={() => set({ currentValue: state.defaultValue })}>
                      Reset to default
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => set({ defaultValue: state.currentValue })}
                    >
                      Set current and default
                    </Button>
                  </SectionRow>
                  <SectionHelperText>
                    Changes live state now. Does not publish or change the default.
                  </SectionHelperText>
                </>
              ) : (
                <SectionHelperText>No active Run. Only defaults can be edited.</SectionHelperText>
              )}
            </Section>
          </PrototypePanel>
        </>
      }
    />
  );
}
