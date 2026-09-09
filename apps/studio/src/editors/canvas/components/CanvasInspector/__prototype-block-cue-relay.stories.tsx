/**
 * PROTOTYPE — throwaway. Not production code, not wired to anything real.
 *
 * Question (#625): how does a director author a Block-owned Cue, and relay it
 * out of a Slot into a Scene Cue with its parameters mapped?
 *
 * Three structurally different variants of the same authoring job, each a
 * standalone panel mounted in the real inspector sidebar shell so density and
 * chrome are honest:
 *
 *   A — Form.      Labelled Sections and rows, exactly like the rest of the
 *                  inspector. Cue and parameter mapping are separate controls.
 *   B — Patch bay. Two columns of pins; click a source then a target. Cue and
 *                  parameter mapping are ONE gesture at two levels.
 *   C — Trace.     The whole relay chain as a path, editable in place. Built
 *                  for nesting and for showing where a half-authored chain
 *                  breaks.
 *
 * All state is local. Nothing persists, nothing mutates a real graph.
 *
 * The fixture throughout is the candidate app from
 * apps/api/src/db/seeds/shows/voting/SEEDS.md.
 */
import {
  Badge,
  Button,
  ChevronRightIcon,
  CircleAlertIcon,
  cn,
  CornerDownRightIcon,
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
import { useState, type ReactNode } from "react";

/* ------------------------------------------------------------------ fixture */

type ParamSourceKind = "unset" | "variable" | "runtimeItem" | "literal";

interface CueParam {
  id: string;
  name: string;
  type: string;
}

interface BlockCue {
  id: string;
  name: string;
  params: CueParam[];
}

const BLOCK_NAME = "CandidateButton";
const BLOCK_VARIABLES = [{ id: "bv_candidate", name: "Candidate", type: "Candidate" }];

const BLOCK_CUES: BlockCue[] = [
  { id: "bc_selected", name: "Selected", params: [{ id: "bp_candidate", name: "Candidate", type: "Candidate" }] },
  { id: "bc_longpress", name: "Held", params: [] },
];

const SCENE_CUES: BlockCue[] = [
  {
    id: "sc_choose",
    name: "Choose candidate",
    params: [{ id: "sp_candidate", name: "Candidate", type: "Candidate" }],
  },
  { id: "sc_dismiss", name: "Dismiss", params: [] },
];

const SOURCE_LABELS: Record<ParamSourceKind, string> = {
  unset: "Not set",
  variable: "Block Variable",
  runtimeItem: "Item from the Slot",
  literal: "Fixed value",
};

/* ------------------------------------------------------------- shared bits */

const TypePill = ({ type }: { type: string }) => (
  <Badge variant="secondary" className="font-mono text-[10px] font-normal">
    {type}
  </Badge>
);

const Incomplete = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
    <CircleAlertIcon className="size-3" />
    {children}
  </span>
);

const PanelShell = ({ title, children }: { title: string; children: ReactNode }) => (
  <SidebarProvider className="min-h-screen w-full bg-background">
    <div className="min-h-screen flex-1 bg-background p-8">
      <p className="max-w-md text-sm text-muted-foreground">
        Prototype for #625. The panel on the right is the thing being judged; this area stands in
        for the Canvas.
      </p>
      <p className="mt-2 max-w-md text-sm font-medium">{title}</p>
    </div>
    <Sidebar collapsible="none" variant="floating" side="right" aria-label="Properties">
      <SidebarContent className="gap-0">{children}</SidebarContent>
    </Sidebar>
  </SidebarProvider>
);

/* ------------------------------------------------- A — form (inspector-native) */

const VariantAName = "Form — sections and rows, like the rest of the inspector";

function VariantABlockRoot() {
  const [cues, setCues] = useState(BLOCK_CUES);
  return (
    <>
      <Section label="Emits">
        <SectionHelperText>
          Cues this Block sends outward. A Slot holding {BLOCK_NAME} can relay them to the Scene.
        </SectionHelperText>
        {cues.map((cue) => (
          <div key={cue.id} className="border-b border-border/50 px-3 py-2 last:border-0">
            <div className="flex items-center gap-2">
              <ZapIcon className="size-3.5 text-muted-foreground" />
              <span className="flex-1 text-sm">{cue.name}</span>
              <Button size="icon" variant="ghost" aria-label={`Delete ${cue.name}`}>
                <Trash2Icon className="size-3.5" />
              </Button>
            </div>
            <div className="mt-1 ml-5 flex flex-col gap-1">
              {cue.params.map((param) => (
                <div key={param.id} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{param.name}</span>
                  <TypePill type={param.type} />
                </div>
              ))}
              <Button size="sm" variant="ghost" className="h-6 justify-start px-1 text-xs">
                <PlusIcon className="size-3" /> Parameter
              </Button>
            </div>
          </div>
        ))}
        <SectionRow>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() =>
              setCues((current) => [
                ...current,
                { id: `bc_${current.length}`, name: "New Cue", params: [] },
              ])
            }
          >
            <PlusIcon className="size-3.5" /> Cue
          </Button>
        </SectionRow>
      </Section>
    </>
  );
}

function VariantAElement() {
  const [source, setSource] = useState<ParamSourceKind>("variable");
  return (
    <Section label="Interactions">
      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          <PointerIcon className="size-3.5 text-muted-foreground" />
          <span className="text-sm">Tap</span>
          <ChevronRightIcon className="size-3.5 text-muted-foreground" />
          <span className="text-sm">Selected</span>
        </div>
        <div className="mt-2 ml-5 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">Send with this Cue:</p>
          <div className="flex items-center gap-2">
            <span className="w-20 text-xs">Candidate</span>
            <Select value={source} onValueChange={(next) => setSource(next as ParamSourceKind)}>
              <SelectTrigger size="sm" className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SOURCE_LABELS) as ParamSourceKind[]).map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {SOURCE_LABELS[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {source === "variable" && (
            <div className="flex items-center gap-2">
              <span className="w-20 text-xs text-muted-foreground">from</span>
              <Select defaultValue="bv_candidate">
                <SelectTrigger size="sm" className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOCK_VARIABLES.map((variable) => (
                    <SelectItem key={variable.id} value={variable.id}>
                      {variable.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {source === "unset" && <Incomplete>Publication is blocked until this is set</Incomplete>}
        </div>
      </div>
    </Section>
  );
}

function VariantASlot() {
  const [target, setTarget] = useState("sc_choose");
  const [mapped, setMapped] = useState(true);
  return (
    <Section label="Relays">
      <SectionHelperText>
        Cues that {BLOCK_NAME} emits, and the Scene Cue each one runs.
      </SectionHelperText>
      {BLOCK_CUES.map((cue) => {
        const wired = cue.id === "bc_selected";
        return (
          <div key={cue.id} className="border-b border-border/50 px-3 py-2 last:border-0">
            <div className="flex items-center gap-2">
              <ZapIcon className="size-3.5 text-muted-foreground" />
              <span className="flex-1 text-sm">{cue.name}</span>
            </div>
            <div className="mt-1.5 ml-5 flex flex-col gap-2">
              <Select
                value={wired ? target : "none"}
                onValueChange={(next) => {
                  if (wired && next) setTarget(next);
                }}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Do nothing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Do nothing</SelectItem>
                  {SCENE_CUES.map((sceneCue) => (
                    <SelectItem key={sceneCue.id} value={sceneCue.id}>
                      {sceneCue.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {wired &&
                cue.params.map((param) => (
                  <div key={param.id} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{param.name}</span>
                    <CornerDownRightIcon className="size-3 text-muted-foreground" />
                    {mapped ? (
                      <button
                        type="button"
                        className="underline decoration-dotted"
                        onClick={() => setMapped(false)}
                      >
                        Candidate
                      </button>
                    ) : (
                      <button type="button" onClick={() => setMapped(true)}>
                        <Incomplete>Nothing mapped</Incomplete>
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        );
      })}
    </Section>
  );
}

/* ------------------------------------------------------- B — patch bay (pins) */

const VariantBName = "Patch bay — click a source pin, then a target pin";

interface Pin {
  id: string;
  label: string;
  type?: string;
  depth: number;
}

const EMIT_PINS: Pin[] = [
  { id: "bc_selected", label: "Selected", depth: 0 },
  { id: "bp_candidate", label: "Candidate", type: "Candidate", depth: 1 },
  { id: "bc_longpress", label: "Held", depth: 0 },
];

const HANDLE_PINS: Pin[] = [
  { id: "sc_choose", label: "Choose candidate", depth: 0 },
  { id: "sp_candidate", label: "Candidate", type: "Candidate", depth: 1 },
  { id: "sc_dismiss", label: "Dismiss", depth: 0 },
];

function PinButton({
  pin,
  state,
  onClick,
}: {
  pin: Pin;
  state: "idle" | "armed" | "connected";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingInlineStart: `${0.5 + pin.depth * 0.75}rem` }}
      className={cn(
        "flex w-full items-center gap-1.5 rounded border px-2 py-1 text-left text-xs transition-colors",
        state === "idle" && "border-transparent hover:border-border hover:bg-accent",
        state === "armed" && "border-primary bg-primary/10 ring-1 ring-primary",
        state === "connected" && "border-border bg-accent/50",
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          state === "connected" ? "bg-primary" : "bg-muted-foreground/40",
        )}
      />
      <span className="flex-1 truncate">{pin.label}</span>
      {pin.type && <TypePill type={pin.type} />}
    </button>
  );
}

function VariantBSlot() {
  const [armed, setArmed] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({ bc_selected: "sc_choose" });

  const connect = (targetId: string) => {
    if (!armed) return;
    setLinks((current) => ({ ...current, [armed]: targetId }));
    setArmed(null);
  };

  return (
    <Section label="Relay">
      <SectionHelperText>
        {armed
          ? "Now click what should receive it."
          : "Click something this Block emits, then click what receives it."}
      </SectionHelperText>
      <div className="grid grid-cols-2 gap-2 px-2 pb-3">
        <div className="flex flex-col gap-1">
          <p className="px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {BLOCK_NAME} emits
          </p>
          {EMIT_PINS.map((pin) => (
            <PinButton
              key={pin.id}
              pin={pin}
              state={armed === pin.id ? "armed" : links[pin.id] ? "connected" : "idle"}
              onClick={() => setArmed((current) => (current === pin.id ? null : pin.id))}
            />
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <p className="px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            This Scene handles
          </p>
          {HANDLE_PINS.map((pin) => {
            const isTarget = Object.values(links).includes(pin.id);
            return (
              <PinButton
                key={pin.id}
                pin={pin}
                state={isTarget ? "connected" : "idle"}
                onClick={() => connect(pin.id)}
              />
            );
          })}
        </div>
      </div>
      {links.bc_selected && !Object.values(links).includes("sp_candidate") && (
        <SectionRow>
          <Incomplete>Choose candidate needs a Candidate. Connect it.</Incomplete>
        </SectionRow>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------ C — trace (path) */

const VariantCName = "Trace — the whole relay chain as one path";

interface Hop {
  id: string;
  kind: "event" | "block" | "slot" | "scene" | "actions";
  title: string;
  detail?: string;
  broken?: boolean;
}

function HopCard({ hop, last }: { hop: Hop; last: boolean }) {
  const label: Record<Hop["kind"], string> = {
    event: "Event",
    block: "Block Cue",
    slot: "Slot",
    scene: "Scene Cue",
    actions: "Runs",
  };
  return (
    <li className="relative pl-6">
      {!last && (
        <span
          aria-hidden
          className={cn(
            "absolute left-[7px] top-5 bottom-0 w-px",
            hop.broken ? "bg-amber-500/50" : "bg-border",
          )}
        />
      )}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-1.5 size-3.5 rounded-full border-2 bg-background",
          hop.broken ? "border-amber-500" : "border-primary",
        )}
      />
      <div className="pb-4">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label[hop.kind]}
        </p>
        <p className="text-sm">{hop.title}</p>
        {hop.detail && <p className="mt-0.5 text-xs text-muted-foreground">{hop.detail}</p>}
        {hop.broken && (
          <div className="mt-1">
            <Incomplete>Nothing mapped. Publication is blocked.</Incomplete>
          </div>
        )}
      </div>
    </li>
  );
}

function VariantCSlot({ nested, broken }: { nested?: boolean; broken?: boolean }) {
  const hops: Hop[] = [
    { id: "h1", kind: "event", title: "Tap on Button frame", detail: "inside CandidateButton" },
    {
      id: "h2",
      kind: "block",
      title: "CandidateButton emits Selected",
      detail: "Candidate ← Block Variable “Candidate”",
    },
    ...(nested
      ? [
          {
            id: "h2b",
            kind: "slot" as const,
            title: "Slot “button-slot” in CandidateRow",
            detail: "Candidate → Candidate",
          },
          {
            id: "h2c",
            kind: "block" as const,
            title: "CandidateRow emits Chosen",
            detail: "Candidate ← relayed",
          },
        ]
      : []),
    {
      id: "h3",
      kind: "slot",
      title: "Slot “candidate-list-slot”",
      detail: broken ? undefined : "Candidate → Candidate",
      broken,
    },
    {
      id: "h4",
      kind: "scene",
      title: "Choose candidate",
      detail: "on Scene “Candidate list”",
    },
    { id: "h5", kind: "actions", title: "Set selected, then go to Confirmation" },
  ];
  return (
    <Section label="Relay">
      <SectionHelperText>Where a tap inside this Slot ends up.</SectionHelperText>
      <ol className="px-3 py-2">
        {hops.map((hop, index) => (
          <HopCard key={hop.id} hop={hop} last={index === hops.length - 1} />
        ))}
      </ol>
    </Section>
  );
}

/* ------------------------------------------------------------------ stories */

const meta: Meta = {
  title: "studio/PROTOTYPE/Block Cue relay authoring (#625)",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

export const A1_FormBlockRoot: Story = {
  name: "A1 — Form: Block root (declare Cues)",
  render: () => (
    <PanelShell title={VariantAName}>
      <VariantABlockRoot />
    </PanelShell>
  ),
};

export const A2_FormElement: Story = {
  name: "A2 — Form: Element inside the Block (fill parameters)",
  render: () => (
    <PanelShell title={VariantAName}>
      <VariantAElement />
    </PanelShell>
  ),
};

export const A3_FormSlot: Story = {
  name: "A3 — Form: Slot (relay outward)",
  render: () => (
    <PanelShell title={VariantAName}>
      <VariantASlot />
    </PanelShell>
  ),
};

export const B1_PatchBay: Story = {
  name: "B1 — Patch bay: Slot",
  render: () => (
    <PanelShell title={VariantBName}>
      <VariantBSlot />
    </PanelShell>
  ),
};

export const C1_Trace: Story = {
  name: "C1 — Trace: Slot",
  render: () => (
    <PanelShell title={VariantCName}>
      <VariantCSlot />
    </PanelShell>
  ),
};

export const C2_TraceNested: Story = {
  name: "C2 — Trace: two levels of nesting",
  render: () => (
    <PanelShell title={VariantCName}>
      <VariantCSlot nested />
    </PanelShell>
  ),
};

export const C3_TraceBroken: Story = {
  name: "C3 — Trace: half-authored relay",
  render: () => (
    <PanelShell title={VariantCName}>
      <VariantCSlot broken />
    </PanelShell>
  ),
};
