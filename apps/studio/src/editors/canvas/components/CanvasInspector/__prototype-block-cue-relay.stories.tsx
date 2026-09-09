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

/**
 * Room to think. Ideas get judged at the size the idea needs, not squeezed
 * into the sidebar they might eventually live in.
 */
const WideShell = ({ title, note, children }: { title: string; note?: string; children: ReactNode }) => (
  <div className="min-h-screen bg-background p-10">
    <p className="text-sm font-medium">{title}</p>
    {note && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{note}</p>}
    <div className="mt-8">{children}</div>
  </div>
);

/** A's sections at their natural width, for side-by-side comparison. */
const NarrowColumn = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-2">
    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
    <div className="w-[300px] overflow-hidden rounded-lg border bg-card">{children}</div>
  </div>
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

/* ------------------------------------- B2 — patch bay with room to breathe */

/**
 * B, rebuilt. The first pass crammed a patch bay into a 250px sidebar, which
 * is the one place a patch bay cannot work: no room for labels, no room for
 * the connections that are the entire point.
 *
 * This is an idea sketch, not a panel. It gets a full-width canvas, real
 * connection curves, and type-aware targets. Where it eventually lives is a
 * separate question from whether the idea is any good.
 */

const PANEL_W = 300;
const GAP = 180;
const ROW_H = 44;
const HEAD_H = 40;

interface BayRow {
  id: string;
  label: string;
  type?: string;
  /** A Cue, or one of its parameters. */
  level: "cue" | "param";
}

const BAY_LEFT: BayRow[] = [
  { id: "bc_selected", label: "Selected", level: "cue" },
  { id: "bp_candidate", label: "Candidate", type: "Candidate", level: "param" },
  { id: "bc_longpress", label: "Held", level: "cue" },
];

const BAY_RIGHT: BayRow[] = [
  { id: "sc_choose", label: "Choose candidate", level: "cue" },
  { id: "sp_candidate", label: "Candidate", type: "Candidate", level: "param" },
  { id: "sc_dismiss", label: "Dismiss", level: "cue" },
];

const rowY = (index: number) => HEAD_H + index * ROW_H + ROW_H / 2;

/** A source may only reach a target of the same level and the same type. */
function compatible(source: BayRow, target: BayRow): boolean {
  if (source.level !== target.level) return false;
  return source.type === target.type;
}

function BayRowButton({
  row,
  side,
  state,
  dimmed,
  onClick,
}: {
  row: BayRow;
  side: "left" | "right";
  state: "idle" | "armed" | "connected";
  dimmed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={dimmed}
      style={{ height: ROW_H }}
      className={cn(
        "flex w-full items-center gap-2 border-b border-border/40 px-3 text-left transition-all",
        row.level === "param" && "pl-8",
        side === "right" && "flex-row-reverse pl-3 text-right",
        side === "right" && row.level === "param" && "pr-8",
        state === "armed" && "bg-primary/15 ring-1 ring-inset ring-primary",
        state === "connected" && "bg-accent/40",
        dimmed ? "cursor-not-allowed opacity-25" : "hover:bg-accent",
      )}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full ring-2 ring-background",
          state === "connected" || state === "armed" ? "bg-primary" : "bg-muted-foreground/30",
        )}
      />
      <span
        className={cn("flex-1 truncate", row.level === "cue" ? "text-sm font-medium" : "text-xs")}
      >
        {row.label}
      </span>
      {row.type && <TypePill type={row.type} />}
    </button>
  );
}

function PatchBay() {
  const [armed, setArmed] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({
    bc_selected: "sc_choose",
    bp_candidate: "sp_candidate",
  });

  const armedRow = BAY_LEFT.find((row) => row.id === armed) ?? null;

  const clickLeft = (row: BayRow) => {
    if (links[row.id]) {
      setLinks((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      return;
    }
    setArmed((current) => (current === row.id ? null : row.id));
  };

  const clickRight = (row: BayRow) => {
    if (!armedRow || !compatible(armedRow, row)) return;
    setLinks((current) => ({ ...current, [armedRow.id]: row.id }));
    setArmed(null);
  };

  const width = PANEL_W * 2 + GAP;
  const height = HEAD_H + Math.max(BAY_LEFT.length, BAY_RIGHT.length) * ROW_H;
  const missingParam = links.bc_selected && !links.bp_candidate;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {armedRow
          ? `Connecting “${armedRow.label}”. Click a matching target, or click it again to cancel.`
          : "Click something the Block emits, then click what should receive it. Click a connected row to disconnect."}
      </p>

      <div className="relative" style={{ width, height }}>
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
        >
          {Object.entries(links).map(([sourceId, targetId]) => {
            const sourceIndex = BAY_LEFT.findIndex((row) => row.id === sourceId);
            const targetIndex = BAY_RIGHT.findIndex((row) => row.id === targetId);
            if (sourceIndex < 0 || targetIndex < 0) return null;
            const x1 = PANEL_W;
            const x2 = PANEL_W + GAP;
            const y1 = rowY(sourceIndex);
            const y2 = rowY(targetIndex);
            const bend = GAP * 0.45;
            return (
              <path
                key={sourceId}
                d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                className="stroke-primary"
                strokeWidth={2}
                fill="none"
              />
            );
          })}
        </svg>

        <div
          className="absolute top-0 left-0 overflow-hidden rounded-lg border bg-card"
          style={{ width: PANEL_W }}
        >
          <p
            className="flex items-center border-b bg-muted/40 px-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
            style={{ height: HEAD_H }}
          >
            {BLOCK_NAME} emits
          </p>
          {BAY_LEFT.map((row) => (
            <BayRowButton
              key={row.id}
              row={row}
              side="left"
              state={armed === row.id ? "armed" : links[row.id] ? "connected" : "idle"}
              dimmed={false}
              onClick={() => clickLeft(row)}
            />
          ))}
        </div>

        <div
          className="absolute top-0 overflow-hidden rounded-lg border bg-card"
          style={{ width: PANEL_W, left: PANEL_W + GAP }}
        >
          <p
            className="flex items-center justify-end border-b bg-muted/40 px-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
            style={{ height: HEAD_H }}
          >
            Candidate list handles
          </p>
          {BAY_RIGHT.map((row) => (
            <BayRowButton
              key={row.id}
              row={row}
              side="right"
              state={Object.values(links).includes(row.id) ? "connected" : "idle"}
              dimmed={Boolean(armedRow) && !compatible(armedRow as BayRow, row)}
              onClick={() => clickRight(row)}
            />
          ))}
        </div>
      </div>

      {missingParam && (
        <Incomplete>Choose candidate still needs a Candidate. Publication is blocked.</Incomplete>
      )}
    </div>
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
  name: "B1 — Patch bay: crammed into the sidebar (rejected)",
  render: () => (
    <PanelShell title={VariantBName}>
      <VariantBSlot />
    </PanelShell>
  ),
};

export const B2_PatchBayWithRoom: Story = {
  name: "B2 — Patch bay: with room",
  render: () => (
    <WideShell
      title="B — Patch bay, rebuilt"
      note="The first pass failed because a patch bay in a 250px column has room for neither labels nor the connections that are the whole point. Same idea at the size it needs: real curves, and targets that dim when they cannot accept what you are holding. Cue-to-Cue and parameter-to-parameter are one gesture at two levels."
    >
      <PatchBay />
    </WideShell>
  ),
};

export const AB_Compare: Story = {
  name: "A vs B — side by side",
  render: () => (
    <WideShell
      title="A vs B, on the Slot"
      note="A is shown at its natural width because being a sidebar form is its premise. B gets the room its premise needs. Both are doing the same job: relay two Cues out of a Slot and map one parameter."
    >
      <div className="flex flex-wrap items-start gap-16">
        <NarrowColumn label="A — Form">
          <VariantASlot />
        </NarrowColumn>
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            B — Patch bay
          </p>
          <PatchBay />
        </div>
      </div>
    </WideShell>
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
