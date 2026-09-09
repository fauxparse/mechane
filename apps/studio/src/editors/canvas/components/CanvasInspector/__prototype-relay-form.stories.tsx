/**
 * PROTOTYPE — throwaway. Not production code, not wired to anything real.
 *
 * Variant A from #625, built properly. B (patch bay) and C (trace) are
 * rejected; they stay in __prototype-block-cue-relay.stories.tsx as the record.
 *
 * A is inspector-native: the authoring job is split across the three selections
 * that already exist, using the same Section / dl / Select idioms as
 * InteractionSection, and lives entirely in the right-hand sidebar.
 *
 *   Block root      →  "Emits"        declare Cues and their parameters
 *   Element in Block →  "Interactions" bind tap, then fill the Cue's parameters
 *   Slot             →  "Relays"       run a Scene Cue, and map into it
 *
 * A relay chain across nested Blocks is read one Slot at a time. Nothing shows
 * the whole chain anywhere — settled on #625 after rejecting the trace.
 *
 * All state is local. Nothing persists, nothing mutates a real graph.
 */
import {
  Button,
  ChevronDownIcon,
  CircleAlertIcon,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  PlusIcon,
  PointerIcon,
  Section,
  SectionHelperText,
  SectionRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sidebar,
  SidebarContent,
  SidebarProvider,
  Trash2Icon,
  ZapIcon,
} from "@mechane/design-system";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Fragment, useState, type ReactNode } from "react";

/* ------------------------------------------------------------------ fixture */

const BLOCK_NAME = "CandidateButton";

const TYPES = ["text", "number", "boolean", "image", "color", "Candidate"] as const;
type TypeName = (typeof TYPES)[number];

interface Param {
  id: string;
  name: string;
  type: TypeName;
}
interface CueDef {
  id: string;
  name: string;
  params: Param[];
}

const BLOCK_VARIABLES: Param[] = [{ id: "bv_candidate", name: "Candidate", type: "Candidate" }];

const SCENE_CUES: CueDef[] = [
  {
    id: "sc_choose",
    name: "Choose candidate",
    params: [{ id: "sp_candidate", name: "Candidate", type: "Candidate" }],
  },
  { id: "sc_dismiss", name: "Dismiss", params: [] },
];

const EMITTED: CueDef[] = [
  {
    id: "bc_selected",
    name: "Selected",
    params: [{ id: "bp_candidate", name: "Candidate", type: "Candidate" }],
  },
  { id: "bc_held", name: "Held", params: [] },
];

/* ---------------------------------------------------------------- primitives */

const ROW = "relative col-span-full grid grid-cols-subgrid gap-y-2";
const DL =
  "col-span-2 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 *:[dt]:label *:[dt]:col-start-1 *:[dd]:col-start-2";

const Blocking = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
    <CircleAlertIcon className="size-3 shrink-0" />
    {children}
  </span>
);

const InspectorShell = ({ caption, children }: { caption: string; children: ReactNode }) => (
  <SidebarProvider className="min-h-screen w-full bg-background">
    <div className="min-h-screen flex-1 bg-background p-10">
      <p className="max-w-md text-sm text-muted-foreground">
        Prototype for #625, variant A. The panel is the thing being judged; this area stands in for
        the Canvas.
      </p>
      <p className="mt-2 max-w-md text-sm font-medium">{caption}</p>
    </div>
    <Sidebar collapsible="none" variant="floating" side="right" aria-label="Properties">
      <SidebarContent className="gap-0">{children}</SidebarContent>
    </Sidebar>
  </SidebarProvider>
);

/**
 * The one control this whole feature turns on: where a value comes from.
 *
 * #627 settled that an Element Binding fills a Cue Parameter with
 * `{ parameterId, source: SlotInputSource }`, reusing the union Slot inputs
 * already use — so this deliberately reads like a Slot input row.
 */
function SourcePicker({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => next && onChange(next)}>
      <SelectTrigger className="w-full min-w-0" aria-label="Value source">
        <SelectValue placeholder="Not set" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
        <SelectItem value="unset">Not set</SelectItem>
      </SelectContent>
    </Select>
  );
}

/* ------------------------------------------ surface 1 — Block root: "Emits" */

function EmitsSection({ initial }: { initial: CueDef[] }) {
  const [cues, setCues] = useState(initial);

  const addCue = () =>
    setCues((current) => [
      ...current,
      { id: `bc_new_${current.length}`, name: "New Cue", params: [] },
    ]);

  const addParam = (cueId: string) =>
    setCues((current) =>
      current.map((cue) =>
        cue.id === cueId
          ? {
              ...cue,
              params: [
                ...cue.params,
                { id: `${cueId}_p${cue.params.length}`, name: "Value", type: "text" as TypeName },
              ],
            }
          : cue,
      ),
    );

  return (
    <Section label="Emits">
      <SectionHelperText>
        Cues this Block sends outward. Any Slot holding {BLOCK_NAME} can run one of its own Cues in
        response.
      </SectionHelperText>

      {cues.length === 0 && (
        <SectionHelperText className="py-1 italic">
          This Block emits nothing yet, so a Slot holding it has nothing to relay.
        </SectionHelperText>
      )}

      {cues.map((cue) => (
        <div key={cue.id} className={ROW}>
          <dl className={DL}>
            <dt>Cue</dt>
            <dd className="flex min-w-0 items-center gap-2">
              <ZapIcon className="size-4 shrink-0 text-muted-foreground" />
              <Input
                value={cue.name}
                aria-label="Cue name"
                onChange={(event) =>
                  setCues((current) =>
                    current.map((candidate) =>
                      candidate.id === cue.id
                        ? { ...candidate, name: event.target.value }
                        : candidate,
                    ),
                  )
                }
              />
            </dd>

            {cue.params.map((param) => (
              <Fragment key={param.id}>
                <dt className="pl-4">{param.name}</dt>
                <dd>
                  <Select
                    value={param.type}
                    onValueChange={(next) =>
                      next &&
                      setCues((current) =>
                        current.map((candidate) =>
                          candidate.id === cue.id
                            ? {
                                ...candidate,
                                params: candidate.params.map((existing) =>
                                  existing.id === param.id
                                    ? { ...existing, type: next as TypeName }
                                    : existing,
                                ),
                              }
                            : candidate,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="w-full min-w-0" aria-label={`${param.name} type`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </dd>
              </Fragment>
            ))}

            <dt />
            <dd>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-full justify-start px-2 text-muted-foreground"
                onClick={() => addParam(cue.id)}
              >
                <PlusIcon className="size-3.5" /> Value
              </Button>
            </dd>
          </dl>

          <div className="col-start-3">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Delete ${cue.name}`}
              title="Delete Cue"
              onClick={() =>
                setCues((current) => current.filter((candidate) => candidate.id !== cue.id))
              }
            >
              <Trash2Icon />
            </Button>
          </div>
        </div>
      ))}

      <SectionRow>
        <Button variant="outline" size="sm" className="col-span-2" onClick={addCue}>
          <PlusIcon /> Add Cue
        </Button>
      </SectionRow>
    </Section>
  );
}

/* ------------------------- surface 2 — Element in a Block: "Interactions" */

function InteractionsSection({ startUnset }: { startUnset?: boolean }) {
  const cue = EMITTED[0] as CueDef;
  const [sources, setSources] = useState<Record<string, string>>(
    startUnset ? {} : { bp_candidate: "bv_candidate" },
  );

  const options = [
    ...BLOCK_VARIABLES.map((variable) => ({
      id: variable.id,
      label: `${variable.name} — this Block’s Variable`,
    })),
    { id: "runtimeItem", label: "The item from the Slot" },
    { id: "literal", label: "A fixed value" },
  ];

  return (
    <Section label="Interactions">
      <div className={ROW}>
        <dl className={DL}>
          <dt>On</dt>
          <dd className="flex min-w-0 items-center gap-2">
            <PointerIcon className="size-4 shrink-0" />
            <span className="truncate">Tap</span>
          </dd>

          <dt>Then</dt>
          <dd className="min-w-0">
            <Select defaultValue={cue.id}>
              <SelectTrigger className="w-full min-w-0" aria-label="Interaction Cue">
                <SelectValue>
                  <div className="flex min-w-0 items-center gap-2">
                    <ZapIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{cue.name}</span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {EMITTED.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    <ZapIcon className="size-4 text-muted-foreground" />
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </dd>

          {cue.params.map((param) => (
            <Fragment key={param.id}>
              <dt className="pl-4">{param.name}</dt>
              <dd className="flex min-w-0 flex-col gap-1">
                <SourcePicker
                  options={options}
                  value={sources[param.id] ?? "unset"}
                  onChange={(next) =>
                    setSources((current) => ({ ...current, [param.id]: next }))
                  }
                />
                {(sources[param.id] ?? "unset") === "unset" && (
                  <Blocking>Needed before this Show can be published</Blocking>
                )}
              </dd>
            </Fragment>
          ))}
        </dl>

        <div className="col-start-3">
          <Button size="icon-sm" variant="ghost" aria-label="Delete interaction" title="Delete">
            <Trash2Icon />
          </Button>
        </div>
      </div>

      <SectionRow>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" className="col-span-2">
                <div className="flex grow items-center justify-center gap-2">
                  <PlusIcon />
                  Add interaction
                </div>
                <ChevronDownIcon />
              </Button>
            }
          />
          <DropdownMenuContent className="w-(--anchor-width)">
            <DropdownMenuItem className="grid grid-cols-[auto_1fr] items-center gap-x-2">
              <PointerIcon className="row-span-2" />
              <span>Tap</span>
              <span className="text-xs text-muted-foreground">User taps or clicks on this</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SectionRow>
    </Section>
  );
}

/* ------------------------------------------------ surface 3 — Slot: "Relays" */

interface Relay {
  id: string;
  sourceCueId: string;
  targetCueId: string | "none";
  mappings: Record<string, string>;
}

function RelaysSection({ initial }: { initial: Relay[] }) {
  const [relays, setRelays] = useState(initial);

  const update = (id: string, patch: Partial<Relay>) =>
    setRelays((current) =>
      current.map((relay) => (relay.id === id ? { ...relay, ...patch } : relay)),
    );

  /** #541: later unconditional relays on one Cue can never fire, but survive. */
  const unreachable = (relay: Relay, index: number) =>
    relays.findIndex((candidate) => candidate.sourceCueId === relay.sourceCueId) < index;

  return (
    <Section label="Relays">
      <SectionHelperText>
        What this Scene does when {BLOCK_NAME} emits something.
      </SectionHelperText>

      {relays.length === 0 && (
        <SectionHelperText className="py-1 italic">
          Nothing relayed yet, so taps inside this Slot do nothing.
        </SectionHelperText>
      )}

      {relays.map((relay, index) => {
        const source = EMITTED.find((cue) => cue.id === relay.sourceCueId);
        const target = SCENE_CUES.find((cue) => cue.id === relay.targetCueId);
        const dead = unreachable(relay, index);

        const options = [
          ...(source?.params ?? []).map((param) => ({
            id: param.id,
            label: `${param.name} — from ${source?.name}`,
          })),
          { id: "runtimeItem", label: "The item from this Slot" },
          { id: "literal", label: "A fixed value" },
        ];

        return (
          <div key={relay.id} className={cn(ROW, dead && "opacity-60")}>
            <dl className={DL}>
              <dt>When</dt>
              <dd className="flex min-w-0 items-center gap-2">
                <ZapIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{source?.name ?? "Unknown"}</span>
              </dd>

              <dt>Run</dt>
              <dd className="min-w-0">
                <Select
                  value={relay.targetCueId}
                  onValueChange={(next) => next && update(relay.id, { targetCueId: next })}
                >
                  <SelectTrigger className="w-full min-w-0" aria-label="Scene Cue">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nothing</SelectItem>
                    {SCENE_CUES.map((cue) => (
                      <SelectItem key={cue.id} value={cue.id}>
                        <ZapIcon className="size-4 text-muted-foreground" />
                        {cue.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </dd>

              {(target?.params ?? []).map((param) => (
                <Fragment key={param.id}>
                  <dt className="pl-4">{param.name}</dt>
                  <dd className="flex min-w-0 flex-col gap-1">
                    <SourcePicker
                      options={options}
                      value={relay.mappings[param.id] ?? "unset"}
                      onChange={(next) =>
                        update(relay.id, { mappings: { ...relay.mappings, [param.id]: next } })
                      }
                    />
                    {(relay.mappings[param.id] ?? "unset") === "unset" && (
                      <Blocking>Needed before this Show can be published</Blocking>
                    )}
                  </dd>
                </Fragment>
              ))}

              {dead && (
                <>
                  <dt />
                  <dd>
                    <span className="text-xs text-muted-foreground">
                      Never runs. {source?.name} is already handled above, and there is no way yet
                      to say when this one should win.
                    </span>
                  </dd>
                </>
              )}
            </dl>

            <div className="col-start-3">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Delete relay"
                title="Delete relay"
                onClick={() =>
                  setRelays((current) => current.filter((candidate) => candidate.id !== relay.id))
                }
              >
                <Trash2Icon />
              </Button>
            </div>
          </div>
        );
      })}

      <SectionRow>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" className="col-span-2">
                <div className="flex grow items-center justify-center gap-2">
                  <PlusIcon />
                  Add relay
                </div>
                <ChevronDownIcon />
              </Button>
            }
          />
          <DropdownMenuContent className="w-(--anchor-width)">
            {EMITTED.map((cue) => (
              <DropdownMenuItem
                key={cue.id}
                className="grid grid-cols-[auto_1fr] items-center gap-x-2"
                onClick={() =>
                  setRelays((current) => [
                    ...current,
                    {
                      id: `r_${current.length}`,
                      sourceCueId: cue.id,
                      targetCueId: "none",
                      mappings: {},
                    },
                  ])
                }
              >
                <ZapIcon className="row-span-2" />
                <span>{cue.name}</span>
                <span className="text-xs text-muted-foreground">
                  {cue.params.length === 0
                    ? "Carries nothing"
                    : `Carries ${cue.params.map((param) => param.name).join(", ")}`}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SectionRow>
    </Section>
  );
}

/* ------------------------------------------------------------------ stories */

const meta: Meta = {
  title: "studio/PROTOTYPE/Relay authoring — variant A (#625)",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

const wired: Relay[] = [
  {
    id: "r0",
    sourceCueId: "bc_selected",
    targetCueId: "sc_choose",
    mappings: { sp_candidate: "bp_candidate" },
  },
];

export const BlockRoot: Story = {
  name: "1 — Block root: declare what it emits",
  render: () => (
    <InspectorShell caption="CandidateButton selected (Block root)">
      <EmitsSection initial={EMITTED} />
    </InspectorShell>
  ),
};

export const BlockRootEmpty: Story = {
  name: "1b — Block root: nothing emitted yet",
  render: () => (
    <InspectorShell caption="A new Block, before any Cue exists">
      <EmitsSection initial={[]} />
    </InspectorShell>
  ),
};

export const ElementInBlock: Story = {
  name: "2 — Element in the Block: fill the Cue",
  render: () => (
    <InspectorShell caption="Button frame selected, inside CandidateButton">
      <InteractionsSection />
    </InspectorShell>
  ),
};

export const ElementInBlockUnset: Story = {
  name: "2b — Element in the Block: half-authored",
  render: () => (
    <InspectorShell caption="A Cue parameter with no source yet — publication blocked">
      <InteractionsSection startUnset />
    </InspectorShell>
  ),
};

export const SlotWired: Story = {
  name: "3 — Slot: relayed and mapped",
  render: () => (
    <InspectorShell caption="candidate-list-slot selected, on the Candidate list Scene">
      <RelaysSection initial={wired} />
    </InspectorShell>
  ),
};

export const SlotUnmapped: Story = {
  name: "3b — Slot: relayed, parameter not mapped",
  render: () => (
    <InspectorShell caption="A Scene Cue chosen, but nothing feeding its Candidate">
      <RelaysSection
        initial={[{ id: "r0", sourceCueId: "bc_selected", targetCueId: "sc_choose", mappings: {} }]}
      />
    </InspectorShell>
  ),
};

export const SlotEmpty: Story = {
  name: "3c — Slot: nothing relayed",
  render: () => (
    <InspectorShell caption="A Slot whose Block emits Cues nobody handles">
      <RelaysSection initial={[]} />
    </InspectorShell>
  ),
};

export const SlotUnreachable: Story = {
  name: "3d — Slot: a second relay that can never fire",
  render: () => (
    <InspectorShell caption="Two relays on one Cue — #541 keeps the order and diagnoses it">
      <RelaysSection
        initial={[
          ...wired,
          {
            id: "r1",
            sourceCueId: "bc_selected",
            targetCueId: "sc_dismiss",
            mappings: {},
          },
        ]}
      />
    </InspectorShell>
  ),
};

export const WholeJob: Story = {
  name: "4 — All three surfaces at once (not a real selection)",
  render: () => (
    <InspectorShell caption="Every surface stacked, only so the whole job is visible in one screenshot">
      <EmitsSection initial={EMITTED} />
      <InteractionsSection />
      <RelaysSection initial={wired} />
    </InspectorShell>
  ),
};
