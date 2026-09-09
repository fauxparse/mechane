/**
 * PROTOTYPE — throwaway. Not production code, not wired to anything real.
 *
 * Question (#631): how does the Show Editor make per-connection dataflow
 * legible — placing a Source inside a Flow, and seeing which Updates stay on
 * the phone?
 *
 * Real `BaseNode` chrome in a hand-laid-out canvas with room, rather than a
 * live React Flow graph. Ideas, not finished UI.
 *
 * The hard case, and the reason this is not obvious: an Update that adjusts
 * `selected.votes` writes SHARED state, because `selected` holds a reference
 * to a Candidate in the global array. But the edge it projects points at
 * `selected`, which sits INSIDE the Flow. So two Update edges can run from
 * one Scene to one Source, look identical, and mean opposite things.
 *
 * Constraint from node-kinds.ts (#35): every node wears identical card chrome
 * and hue is reserved for state, never for type. None of these variants may
 * tint a node to say "Flow-local".
 *
 * NEW RULE, decided on #631: a Flow may drive many Devices, but they must all
 * agree on `perConnection`. Mixing a Shared and a per-connection Device on one
 * Flow is invalid. This amends #622, which had treated the mixed case as
 * ordinary, and it is what finally makes "one copy per connection" a true
 * thing to write on a Flow boundary.
 */
import { CircleAlertIcon, cn, ServerIcon, SmartphoneIcon } from "@mechane/design-system";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";

import type { ShowFlowNode } from "./graph-to-flow";
import { BaseNode } from "./nodes/BaseNode";
import "./show-graph-editor.css";

/* ------------------------------------------------------------------ fixture */

type NodeData = ShowFlowNode["data"];

const base: NodeData = {
  name: "",
  color: "neutral",
  kind: "scene",
  type: null,
  fields: [],
  cues: [],
  variables: [],
  wiredVariableIds: [],
  defaultSceneId: null,
  isDefaultScene: false,
  childCount: 0,
  perConnection: false,
  driven: false,
  pairingCode: null,
};

const CANDIDATE_FIELDS = [
  { id: "f_name", name: "Name", type: "text" as const },
  { id: "f_votes", name: "Votes", type: "number" as const },
  { id: "f_image", name: "Image", type: "image" as const },
];

/* ------------------------------------------------------- canvas primitives */

const W = 1180;
const H = 560;

interface Placed {
  x: number;
  y: number;
  w: number;
}

const CANDIDATES: Placed = { x: 30, y: 70, w: 210 };
const LIST: Placed = { x: 420, y: 80, w: 210 };
const CONFIRM: Placed = { x: 420, y: 270, w: 210 };
const SELECTED: Placed = { x: 700, y: 270, w: 200 };
const AUDIENCE: Placed = { x: 960, y: 300, w: 190 };
const PROJECTOR: Placed = { x: 960, y: 70, w: 190 };
const FLOW = { x: 380, y: 30, w: 560, h: 420 };

const Node = ({
  at,
  data,
  children,
  marker,
}: {
  at: Placed;
  data: Partial<NodeData>;
  children?: ReactNode;
  marker?: ReactNode;
}) => (
  <div className="absolute" style={{ left: at.x, top: at.y, width: at.w }}>
    <BaseNode id={data.name ?? "n"} data={{ ...base, ...data } as NodeData}>
      {children}
    </BaseNode>
    {marker}
  </div>
);

/** A Source's fields, drawn the way NodeFieldList does without its handles. */
const Fields = ({
  fields,
  sharedField,
}: {
  fields: { id: string; name: string; type: string }[];
  sharedField?: string;
}) => (
  <div className="flex flex-col py-1">
    {fields.map((field) => (
      <div
        key={field.id}
        className={cn(
          "flex items-center gap-2 px-3 py-0.5 text-xs text-(--flow-foreground)",
          sharedField === field.id && "bg-(--flow-border)/15",
        )}
      >
        <span className="flex-1">{field.name}</span>
        {sharedField === field.id && (
          <span className="inline-flex items-center gap-1 text-[10px] text-(--flow-muted-foreground)">
            <ServerIcon className="size-3" /> shared
          </span>
        )}
      </div>
    ))}
  </div>
);

const FlowBoundary = ({ caption, invalid }: { caption?: ReactNode; invalid?: ReactNode }) => (
  <div
    className={cn(
      "absolute rounded-xl border-2 border-dashed bg-(--flow-background)/5",
      invalid ? "border-amber-500" : "border-(--flow-border)/60",
    )}
    style={{ left: FLOW.x, top: FLOW.y, width: FLOW.w, height: FLOW.h }}
    data-flow-theme="purple"
  >
    <div className="flex items-baseline gap-2 px-4 pt-2">
      <span className="text-sm font-medium text-(--flow-foreground)">Audience flow</span>
      {caption}
    </div>
    {invalid && (
      <div className="mx-4 mt-2 flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        <CircleAlertIcon className="mt-px size-3.5 shrink-0" />
        <span>{invalid}</span>
      </div>
    )}
  </div>
);

/* ------------------------------------------------------------------- edges */

type EdgeKind = "wiring" | "instance" | "show" | "depends";

interface EdgeSpec {
  id: string;
  from: [number, number];
  to: [number, number];
  kind: EdgeKind;
  label?: string;
  /** Nudges the label off the curve's midpoint when two edges overlap. */
  labelDy?: number;
}

function curve(from: [number, number], to: [number, number]) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const bend = Math.max(40, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function midpoint(from: [number, number], to: [number, number]) {
  return [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2] as const;
}

const Edges = ({ edges, showMarkers }: { edges: EdgeSpec[]; showMarkers?: boolean }) => (
  <svg aria-hidden className="pointer-events-none absolute inset-0" width={W} height={H}>
    {edges.map((edge) => (
      <path
        key={edge.id}
        d={curve(edge.from, edge.to)}
        fill="none"
        strokeWidth={2}
        className={cn(
          edge.kind === "wiring" ? "stroke-muted-foreground/40" : "stroke-muted-foreground/80",
        )}
        strokeDasharray={edge.kind === "wiring" ? "4 4" : undefined}
      />
    ))}
    {showMarkers &&
      edges
        .filter((edge) => edge.kind !== "wiring")
        .map((edge) => {
          const [mx, my] = midpoint(edge.from, edge.to);
          return (
            <g key={`${edge.id}-marker`} transform={`translate(${mx}, ${my + (edge.labelDy ?? 0)})`}>
              <circle r={13} className="fill-background stroke-border" strokeWidth={1} />
              <foreignObject x={-8} y={-8} width={16} height={16}>
                <ScopeGlyph kind={edge.kind} />
              </foreignObject>
            </g>
          );
        })}
  </svg>
);

const ScopeGlyph = ({ kind }: { kind: EdgeKind }) => {
  if (kind === "show") return <ServerIcon className="size-4" />;
  if (kind === "instance") return <SmartphoneIcon className="size-4" />;
  return (
    <span className="relative inline-flex">
      <SmartphoneIcon className="size-4" />
      <span className="absolute -top-1 -right-1 text-[9px] leading-none font-bold">?</span>
    </span>
  );
};

/* ------------------------------------------------------------------- shell */

const Canvas = ({
  title,
  note,
  children,
  legend,
}: {
  title: string;
  note: string;
  children: ReactNode;
  legend?: ReactNode;
}) => (
  <div className="min-h-screen bg-background p-10">
    <p className="text-sm font-medium">{title}</p>
    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{note}</p>
    <div
      className="mechane-show-graph relative mt-8 rounded-lg border bg-card"
      data-flow-theme="neutral"
      style={{ width: W, height: H }}
    >
      {children}
    </div>
    {legend && <div className="mt-4 flex flex-wrap gap-6 text-xs text-muted-foreground">{legend}</div>}
  </div>
);

const LegendItem = ({ glyph, children }: { glyph: ReactNode; children: ReactNode }) => (
  <span className="inline-flex items-center gap-2">
    <span className="inline-flex size-6 items-center justify-center rounded-full border bg-background">
      {glyph}
    </span>
    {children}
  </span>
);

/* --------------------------------------------------------------- the graph */

const EDGES: EdgeSpec[] = [
  {
    id: "wiring",
    from: [CANDIDATES.x + CANDIDATES.w, CANDIDATES.y + 34],
    to: [LIST.x, LIST.y + 34],
    kind: "wiring",
  },
  {
    id: "set-selected",
    from: [LIST.x + LIST.w, LIST.y + 50],
    to: [SELECTED.x, SELECTED.y + 20],
    kind: "instance",
  },
  {
    id: "reset-selected",
    from: [CONFIRM.x + CONFIRM.w, CONFIRM.y + 26],
    to: [SELECTED.x, SELECTED.y + 40],
    kind: "instance",
  },
  {
    id: "adjust-votes",
    from: [CONFIRM.x + CONFIRM.w, CONFIRM.y + 56],
    to: [SELECTED.x, SELECTED.y + 92],
    kind: "show",
    labelDy: 26,
  },
];

function GraphBody({
  flowCaption,
  flowInvalid,
  selectedSubtitle,
  sharedField,
  selectedMarker,
  projectorPerConnection,
}: {
  flowCaption?: ReactNode;
  flowInvalid?: ReactNode;
  selectedSubtitle?: ReactNode;
  sharedField?: string;
  selectedMarker?: ReactNode;
  projectorPerConnection?: boolean;
}) {
  return (
    <>
      <FlowBoundary caption={flowCaption} invalid={flowInvalid} />
      <Node at={CANDIDATES} data={{ name: "candidates", kind: "source", type: "text" }}>
        <Fields fields={CANDIDATE_FIELDS} />
      </Node>
      <Node at={LIST} data={{ name: "Candidate list", kind: "scene", color: "purple" }} />
      <Node at={CONFIRM} data={{ name: "Confirmation", kind: "scene", color: "purple" }} />
      <Node
        at={SELECTED}
        data={{ name: "selected", kind: "source", type: "text", color: "purple" }}
        marker={selectedMarker}
      >
        {selectedSubtitle}
        <Fields fields={CANDIDATE_FIELDS} sharedField={sharedField} />
      </Node>
      <Node
        at={PROJECTOR}
        data={{ name: "Projector", kind: "device", perConnection: projectorPerConnection }}
      />
      <Node at={AUDIENCE} data={{ name: "Audience", kind: "device", perConnection: true }} />
    </>
  );
}

/* ------------------------------------------------------------------ stories */

const meta: Meta = {
  title: "studio/PROTOTYPE/Scope legibility in the Show Editor (#631)",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

export const Problem: Story = {
  name: "0 — The problem, undecorated",
  render: () => (
    <Canvas
      title="What the graph shows today"
      note="Three Update edges. Two write the phone's own state; the third increments a candidate's votes on the server, because `selected` holds a reference into the global array. All three point at a Source inside the Flow, and all three look identical. A vote that quietly stays on one phone is the failure this surface exists to prevent."
    >
      <Edges edges={EDGES} />
      <GraphBody />
    </Canvas>
  ),
};

export const A_EdgeMarkers: Story = {
  name: "A — The edge says it",
  render: () => (
    <Canvas
      title="A — a scope glyph at each Update edge's midpoint"
      note="The answer is carried by the thing whose meaning is in question. Nothing else changes, and a Cue with a mixed Action list shows one glyph per edge, so the mix is visible without ordering being implied."
      legend={
        <>
          <LegendItem glyph={<SmartphoneIcon className="size-3.5" />}>
            Stays on the device
          </LegendItem>
          <LegendItem glyph={<ServerIcon className="size-3.5" />}>Reaches the server</LegendItem>
          <LegendItem glyph={<ScopeGlyph kind="depends" />}>
            Depends on what the Source holds
          </LegendItem>
        </>
      }
    >
      <Edges edges={EDGES} showMarkers />
      <GraphBody />
    </Canvas>
  ),
};

export const B_SourceDeclares: Story = {
  name: "B — the Source declares its scope",
  render: () => (
    <Canvas
      title="B — scope belongs to the data, and edges inherit it"
      note="Edges stay undecorated. Each Source says what it is, and a Flow-local Source marks the fields that reach shared data through a reference. Reading an Update means reading its target, which is where the truth lives anyway."
      legend={
        <LegendItem glyph={<ServerIcon className="size-3.5" />}>
          A field whose value lives outside the Flow, reached by reference
        </LegendItem>
      }
    >
      <Edges edges={EDGES} />
      <GraphBody
        selectedSubtitle={
          <div className="border-b border-(--flow-border)/20 px-3 py-1.5 text-[11px] text-(--flow-muted-foreground)">
            One copy per Device Instance
          </div>
        }
        sharedField="f_votes"
      />
    </Canvas>
  ),
};

export const C_BoundaryDeclares: Story = {
  name: "C — the boundary says it once",
  render: () => (
    <Canvas
      title="C — the Flow declares it, and crossing the boundary is the signal"
      note="Said once at the top instead of on every node. Geometry does the rest: an Update leaving the boundary reaches shared state, one staying inside does not. Cheapest of the three, and wrong exactly where it matters — see the next story."
    >
      <Edges edges={EDGES} />
      <GraphBody
        flowCaption={
          <span className="inline-flex items-center gap-1 text-xs text-(--flow-muted-foreground)">
            <SmartphoneIcon className="size-3" /> one copy of everything inside, per connection
          </span>
        }
      />
    </Canvas>
  ),
};

export const C2_BoundaryLies: Story = {
  name: "C2 — where the boundary lies",
  render: () => (
    <Canvas
      title="C — the case geometry cannot express"
      note="The vote edge never leaves the Flow, so C reads it as local. It is not: it increments a candidate on the server. C has to patch the exact case it was meant to make obvious, which is the argument against it."
      legend={
        <LegendItem glyph={<ServerIcon className="size-3.5" />}>
          Patch: the one edge the boundary gets wrong
        </LegendItem>
      }
    >
      <Edges edges={EDGES.filter((edge) => edge.kind !== "show")} />
      <Edges edges={EDGES.filter((edge) => edge.kind === "show")} showMarkers />
      <GraphBody
        flowCaption={
          <span className="inline-flex items-center gap-1 text-xs text-(--flow-muted-foreground)">
            <SmartphoneIcon className="size-3" /> one copy of everything inside, per connection
          </span>
        }
      />
    </Canvas>
  ),
};

export const Combined: Story = {
  name: "A + boundary — cardinality once, scope per edge",
  render: () => (
    <Canvas
      title="What the new rule makes possible"
      note="A Flow's Devices must now agree on cardinality, so the boundary can say “one copy per connection” and be telling the truth. That leaves only the write-scope question on the edges, which is the part geometry could never answer anyway. Two statements, each in the place that can actually make it."
      legend={
        <>
          <LegendItem glyph={<SmartphoneIcon className="size-3.5" />}>
            Stays on the device
          </LegendItem>
          <LegendItem glyph={<ServerIcon className="size-3.5" />}>Reaches the server</LegendItem>
        </>
      }
    >
      <Edges edges={EDGES} showMarkers />
      <GraphBody
        flowCaption={
          <span className="inline-flex items-center gap-1 text-xs text-(--flow-muted-foreground)">
            <SmartphoneIcon className="size-3" /> one copy per connection
          </span>
        }
      />
    </Canvas>
  ),
};

export const IllegalDrop: Story = {
  name: "Illegal — dropping a Projector on an audience Flow",
  render: () => (
    <Canvas
      title="The gesture is refused"
      note="A Flow may drive several Devices, but they must agree on cardinality. Wiring the Projector here would make one Source mean two different things at once, so Studio refuses the drop and says why rather than accepting it and diagnosing later."
    >
      <Edges edges={EDGES} />
      <GraphBody
        flowCaption={
          <span className="inline-flex items-center gap-1 text-xs text-(--flow-muted-foreground)">
            <SmartphoneIcon className="size-3" /> one copy per connection
          </span>
        }
      />
      <svg aria-hidden className="pointer-events-none absolute inset-0" width={W} height={H}>
        <path
          d={curve([FLOW.x + FLOW.w, FLOW.y + 60], [PROJECTOR.x, PROJECTOR.y + 34])}
          fill="none"
          strokeWidth={2}
          strokeDasharray="6 5"
          className="stroke-amber-500"
        />
      </svg>
      <div
        className="absolute flex max-w-[15rem] items-start gap-2 rounded-md border border-amber-500/50 bg-background px-3 py-2 text-xs shadow-md"
        style={{ left: PROJECTOR.x - 40, top: PROJECTOR.y + 110 }}
      >
        <CircleAlertIcon className="mt-px size-3.5 shrink-0 text-amber-500" />
        <span>
          Audience flow already drives an Audience Device. A Flow cannot drive both shared and
          per-connection Devices.
        </span>
      </div>
    </Canvas>
  ),
};

export const InvalidatedByFlip: Story = {
  name: "Illegal — a Device kind flipped underneath",
  render: () => (
    <Canvas
      title="Refusing the gesture is not enough"
      note="`perConnection` can be changed after creation, so a Flow can become mixed without anyone touching its edges. The refusal in the previous story cannot catch this, which is why the domain diagnoses a mixed Flow wherever it came from. Preserved, and blocks publication."
    >
      <Edges
        edges={[
          ...EDGES,
          {
            id: "projector-drive",
            from: [FLOW.x + FLOW.w, FLOW.y + 60],
            to: [PROJECTOR.x, PROJECTOR.y + 34],
            kind: "wiring",
          },
        ]}
      />
      <GraphBody
        projectorPerConnection
        flowInvalid={
          <>
            This Flow drives both shared and per-connection Devices, so a Flow-local Source here
            would mean two different things at once. Publication is blocked until one of them
            changes.
          </>
        }
      />
    </Canvas>
  ),
};
