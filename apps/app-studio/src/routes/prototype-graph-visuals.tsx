/*
 * ============================================================================
 * PROTOTYPE — THROWAWAY. DO NOT BUILD ON THIS. Delete before merging to main.
 * ============================================================================
 *
 * Round 2. Answers what is left open on issue #35 (visual language for graph
 * node and edge types), on map #34.
 *
 * FINAL icon set, as decided on #35:
 *   Scene = TvMinimal · Flow = Workflow · Transformer = Bot
 *   Device = Projector (single-endpoint) / Smartphone (Audience role)
 *   default Scene badge = House
 *   Source = by the TYPE OF DATA it holds, not one icon for all Sources:
 *     text = Type · number = Hash · boolean = ToggleLeft · object = Box
 *     array = List
 *
 *   ⚠ CAVEAT on the Source mapping: the type set itself is not specified
 *   anywhere yet. PRD.md line 142 explicitly defers it ("Exact GraphQL schema
 *   for Shapes ... should be resolved before Source/Shape tickets are
 *   written"), so these five types are inferred from CONTEXT.md's "a raw
 *   value, object, or array" plus Shape's "fields, their types and defaults".
 *   If the real type set gains members (date, image, colour, enum), the
 *   mapping needs extending — the by-type principle still holds.
 *
 * The bottom bar switches theme mode/palette and two canvas states.
 *
 * Everything else on this canvas is a decision ALREADY SETTLED on #35 and is
 * held constant on purpose — context to judge the icons against, not an option:
 *   - node identity is icon + label only; identical `card` chrome, no per-type
 *     silhouette and no per-type hue
 *   - Scene nodes: header, then one labelled row per Variable, handle on the row
 *   - fixed node width, truncate with ellipsis
 *   - no visual distinction between the three edge types (deferred)
 *   - parallel Navigate edges fan, each labelled with its Cue name
 *   - Flow: translucent tint + title bar (name / chevron / Device handle);
 *     collapsed keeps the same title bar and its boundary handles
 *   - Flow-local marker no; per-node dirty marker no
 *   - dangling input: destructive dot on the row + warning icon in the header,
 *     no downstream propagation
 *   - handle-drag: valid targets highlighted, non-targetable dimmed
 *   - no zoom LOD tiers
 *
 * Run: `pnpm prototype:graph-visuals`, then open /prototype-graph-visuals on
 * whichever port Vite reports.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Bot,
  Box,
  ChevronDown,
  ChevronRight,
  Hash,
  House,
  List,
  Projector,
  Smartphone,
  ToggleLeft,
  TriangleAlert,
  TvMinimal,
  Type as TypeIcon,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect } from "react";
import ReactFlow, {
  BaseEdge,
  Background,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
} from "reactflow";
import type { Edge, EdgeProps, Node, NodeProps } from "reactflow";
import "reactflow/dist/style.css";

import { cn } from "@presence/design-system";

/* -------------------------------------------------------------------------- */
/* settled node icons                                                         */
/* -------------------------------------------------------------------------- */

const SCENE_ICON = TvMinimal;
const FLOW_ICON = Workflow;
const TRANSFORMER_ICON = Bot;
const DEVICE_ICON = { single: Projector, audience: Smartphone } as const;
const DEFAULT_SCENE_ICON = House;

/* -------------------------------------------------------------------------- */
/* the variable being tested: Source-icon-by-data-type                        */
/* -------------------------------------------------------------------------- */

type SourceType = "text" | "number" | "boolean" | "object" | "array";

const SOURCE_TYPES: SourceType[] = ["text", "number", "boolean", "object", "array"];

const SOURCE_ICONS: Record<SourceType, LucideIcon> = {
  text: TypeIcon,
  number: Hash,
  boolean: ToggleLeft,
  object: Box,
  array: List,
};

/* -------------------------------------------------------------------------- */
/* shared node chrome — identical for every type, per #35 Q1(a)               */
/* -------------------------------------------------------------------------- */

const NODE_WIDTH = 216;

interface Row {
  name: string;
  /** upstream producer was deleted, so this Variable has no value (#29) */
  dangling?: boolean;
}

interface ShellProps {
  icon: LucideIcon;
  title: string;
  rows?: Row[];
  defaultBadge?: boolean;
  dimmed?: boolean;
  targetable?: boolean;
  hasOutput?: boolean;
  hasInput?: boolean;
  subtitle?: string;
}

function Shell({
  icon: Icon,
  title,
  rows,
  defaultBadge,
  dimmed,
  targetable,
  hasOutput,
  hasInput,
  subtitle,
}: ShellProps) {
  const hasDangling = rows?.some((r) => r.dangling);
  const Badge = defaultBadge ? DEFAULT_SCENE_ICON : undefined;

  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={cn(
        "rounded-md border border-border bg-card text-card-foreground shadow-sm transition-opacity",
        dimmed && "opacity-25",
        targetable && "ring-2 ring-ring",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{title}</span>
        {Badge ? <Badge className="ml-auto size-3.5 shrink-0 text-muted-foreground" /> : null}
        {hasDangling ? (
          <TriangleAlert
            className={cn("size-3.5 shrink-0 text-destructive", !Badge && "ml-auto")}
          />
        ) : null}
      </div>

      {rows?.length ? (
        <div className="py-1">
          {rows.map((row) => (
            <div key={row.name} className="relative flex items-center gap-2 px-2.5 py-1">
              <Handle
                type="target"
                position={Position.Left}
                id={row.name}
                style={{ left: -5, top: "50%" }}
                className="!size-2 !border-border !bg-muted-foreground"
              />
              <span className="truncate text-xs text-muted-foreground">{row.name}</span>
              {row.dangling ? (
                <span
                  className="ml-auto size-1.5 shrink-0 rounded-full bg-destructive"
                  title="No producer wired — value is undefined at run time"
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {subtitle ? (
        <div className="truncate px-2.5 pb-1.5 pt-1 text-xs text-muted-foreground">{subtitle}</div>
      ) : null}

      {hasInput ? (
        <Handle
          type="target"
          position={Position.Left}
          className="!size-2 !border-border !bg-muted-foreground"
        />
      ) : null}
      {hasOutput ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!size-2 !border-border !bg-muted-foreground"
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* node types                                                                 */
/* -------------------------------------------------------------------------- */

interface NodeData extends Omit<ShellProps, "icon" | "title"> {
  label: string;
  kind: "scene" | "source" | "transformer" | "device";
  sourceType?: SourceType;
  deviceRole?: "single" | "audience";
}

function PlainNode({ data }: NodeProps<NodeData>) {
  const icon =
    data.kind === "scene"
      ? SCENE_ICON
      : data.kind === "transformer"
        ? TRANSFORMER_ICON
        : data.kind === "device"
          ? DEVICE_ICON[data.deviceRole ?? "single"]
          : SOURCE_ICONS[data.sourceType ?? "text"];

  return <Shell {...data} icon={icon} title={data.label} />;
}

interface FlowNodeData {
  label: string;
  sceneCount: number;
  collapsed: boolean;
  dimmed?: boolean;
  onToggle: () => void;
}

function FlowNode({ data }: NodeProps<FlowNodeData>) {
  const Chevron = data.collapsed ? ChevronRight : ChevronDown;

  return (
    <div
      className={cn(
        "size-full rounded-lg border border-border bg-accent/20 transition-opacity",
        data.dimmed && "opacity-25",
      )}
    >
      <div className="flex items-center gap-2 rounded-t-lg border-b border-border bg-accent/30 px-2.5 py-1.5">
        <button type="button" onClick={data.onToggle} className="flex items-center gap-2 text-left">
          <Chevron className="size-4 shrink-0 text-muted-foreground" />
          <FLOW_ICON className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{data.label}</span>
        </button>
        {data.collapsed ? (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {data.sceneCount} scenes
          </span>
        ) : null}
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="!size-2 !border-border !bg-muted-foreground"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2 !border-border !bg-muted-foreground"
      />
    </div>
  );
}

const nodeTypes = { plain: PlainNode, flow: FlowNode };

/* -------------------------------------------------------------------------- */
/* fanned Navigate edge (#35 Q4)                                              */
/* -------------------------------------------------------------------------- */

/**
 * #20 allows several Navigate edges between the same Scene pair — one per
 * Cue/Action pairing — so they must be visibly separable. React Flow's bezier
 * `curvature` barely separates paths over a short horizontal gap (round 1 of
 * this prototype proved it: three identical paths, all labels on one pixel), so
 * each edge takes an explicit vertical offset and carries its Cue name at the
 * curve's apex.
 */
function FannedEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  label,
  data,
}: EdgeProps<{ offset: number }>) {
  const offset = data?.offset ?? 0;
  const cx = (sourceX + targetX) / 2;
  const cy = (sourceY + targetY) / 2 + offset;
  const lx = 0.25 * sourceX + 0.5 * cx + 0.25 * targetX;
  const ly = 0.25 * sourceY + 0.5 * cy + 0.25 * targetY;

  return (
    <>
      <BaseEdge path={`M ${sourceX},${sourceY} Q ${cx},${cy} ${targetX},${targetY}`} />
      <EdgeLabelRenderer>
        <div
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          className="pointer-events-none absolute rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = { fanned: FannedEdge };

/* -------------------------------------------------------------------------- */
/* the sample Show                                                            */
/* -------------------------------------------------------------------------- */

function buildGraph(opts: {
  collapsed: boolean;
  dragging: boolean;
  onToggle: () => void;
}): { nodes: Node[]; edges: Edge[] } {
  const { collapsed, dragging, onToggle } = opts;

  // Dragging out of a Source output: only Scene Variables and Transformer
  // inputs can accept it (#24), so everything else dims.
  const dim = (targetable: boolean) => ({
    dimmed: dragging && !targetable,
    targetable: dragging && targetable,
  });

  // One Source per data type, so the whole mapping is visible at once.
  const sources: { id: string; label: string; type: SourceType; note: string }[] = [
    { id: "s-prompt", label: "Question text", type: "text", note: "text" },
    { id: "s-tally", label: "Vote tally", type: "number", note: "number" },
    { id: "s-open", label: "Voting open", type: "boolean", note: "boolean" },
    { id: "s-team", label: "Winning team", type: "object", note: "object · Shape: Team" },
    { id: "s-board", label: "Leaderboard", type: "array", note: "array of Team" },
  ];

  const nodes: Node[] = [
    ...sources.map((s, i) => ({
      id: s.id,
      type: "plain",
      position: { x: 40, y: 40 + i * 92 },
      data: {
        kind: "source" as const,
        sourceType: s.type,
        label: s.label,
        subtitle: s.note,
        hasOutput: true,
        ...dim(false),
      },
    })),
    {
      id: "xf-format",
      type: "plain",
      position: { x: 330, y: 130 },
      data: {
        kind: "transformer",
        label: "Formatted tally",
        subtitle: '"{{tally}} votes"',
        hasInput: true,
        hasOutput: true,
        ...dim(true),
      },
    },
    {
      id: "scene-standby",
      type: "plain",
      position: { x: 330, y: 330 },
      data: {
        kind: "scene",
        label: "Standby",
        rows: [{ name: "message" }],
        hasOutput: true,
        ...dim(true),
      },
    },
    {
      id: "flow",
      type: "flow",
      position: { x: 660, y: 40 },
      style: { width: collapsed ? 260 : 560, height: collapsed ? 40 : 320 },
      data: {
        label: "Audience voting",
        sceneCount: 2,
        collapsed,
        dimmed: dragging,
        onToggle,
      },
    },
    {
      id: "dev-audience",
      type: "plain",
      position: { x: 1300, y: 60 },
      data: {
        kind: "device",
        deviceRole: "audience",
        label: "Audience phones",
        subtitle: "Audience role · code 4F7K",
        hasInput: true,
        ...dim(false),
      },
    },
    {
      id: "dev-projector",
      type: "plain",
      position: { x: 1300, y: 300 },
      data: {
        kind: "device",
        deviceRole: "single",
        label: "Projector",
        subtitle: "Single endpoint",
        hasInput: true,
        ...dim(false),
      },
    },
  ];

  if (!collapsed) {
    nodes.push(
      {
        id: "scene-question",
        type: "plain",
        parentNode: "flow",
        extent: "parent",
        position: { x: 22, y: 56 },
        data: {
          kind: "scene",
          label: "Question",
          defaultBadge: true,
          rows: [{ name: "prompt" }, { name: "voterCount", dangling: true }],
          hasOutput: true,
          ...dim(true),
        },
      },
      {
        id: "scene-results",
        type: "plain",
        parentNode: "flow",
        extent: "parent",
        position: { x: 310, y: 56 },
        data: {
          kind: "scene",
          label: "Results",
          rows: [{ name: "total" }, { name: "leaderNameThatIsFarTooLongToFit" }],
          hasOutput: true,
          ...dim(true),
        },
      },
      {
        id: "s-myvote",
        type: "plain",
        parentNode: "flow",
        extent: "parent",
        position: { x: 22, y: 220 },
        data: {
          kind: "source",
          sourceType: "text",
          label: "My vote",
          subtitle: "text · per audience instance",
          hasOutput: true,
          // no Flow-local marker on purpose — the boundary IS the marker (#29)
          ...dim(false),
        },
      },
    );
  }

  const edges: Edge[] = [
    { id: "w1", source: "s-tally", target: "xf-format", type: "default" },
    { id: "d1", source: "flow", target: "dev-audience", type: "default" },
    { id: "d2", source: "scene-standby", target: "dev-projector", type: "default" },
  ];

  if (collapsed) {
    // wiring re-routes to the Flow's own boundary while collapsed (#23)
    edges.push({ id: "w2", source: "xf-format", target: "flow", type: "default" });
  } else {
    edges.push(
      {
        id: "w2",
        source: "xf-format",
        target: "scene-results",
        targetHandle: "total",
        type: "default",
      },
      {
        id: "w3",
        source: "s-prompt",
        target: "scene-question",
        targetHandle: "prompt",
        type: "default",
      },
      {
        id: "n1",
        source: "scene-question",
        target: "scene-results",
        type: "fanned",
        label: "Submit",
        data: { offset: -46 },
      },
      {
        id: "n2",
        source: "scene-question",
        target: "scene-results",
        type: "fanned",
        label: "Timeout",
        data: { offset: -128 },
      },
      {
        id: "n3",
        source: "scene-results",
        target: "scene-question",
        type: "fanned",
        label: "Retry",
        data: { offset: 150 },
      },
    );
  }

  return { nodes, edges };
}

/* -------------------------------------------------------------------------- */
/* the prototype route                                                        */
/* -------------------------------------------------------------------------- */

export interface Search {
  mode?: string;
  palette?: string;
  collapsed?: string;
  dragging?: string;
}

export const Route = createFileRoute("/prototype-graph-visuals")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    mode: typeof search.mode === "string" ? search.mode : undefined,
    palette: typeof search.palette === "string" ? search.palette : undefined,
    collapsed: search.collapsed ? "1" : undefined,
    dragging: search.dragging ? "1" : undefined,
  }),
  component: PrototypeRoute,
});

function PrototypeRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const mode = search.mode ?? "dark";
  const palette = search.palette ?? "slate";
  const collapsed = Boolean(search.collapsed);
  const dragging = Boolean(search.dragging);

  useEffect(() => {
    const html = document.documentElement;
    const prevMode = html.getAttribute("data-theme-mode");
    const prevPalette = html.getAttribute("data-theme-palette");
    html.setAttribute("data-theme-mode", mode);
    html.setAttribute("data-theme-palette", palette);
    return () => {
      if (prevMode) html.setAttribute("data-theme-mode", prevMode);
      if (prevPalette) html.setAttribute("data-theme-palette", prevPalette);
    };
  }, [mode, palette]);

  const set = (patch: Partial<Search>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const { nodes, edges } = buildGraph({
    collapsed,
    dragging,
    onToggle: () => set({ collapsed: collapsed ? undefined : "1" }),
  });

  return (
    <div className="fixed inset-0 flex flex-col bg-background text-foreground">
      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            minZoom={0.1}
            maxZoom={2}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background className="!bg-background" />
            {/* React Flow ships hardcoded white chrome for these — they need
                token overrides to survive a theme switch (#21). */}
            <Controls className="[&_button]:!border-border [&_button]:!bg-card [&_button]:!fill-foreground [&_button:hover]:!bg-secondary" />
            <MiniMap
              pannable
              zoomable
              className="!bg-card"
              maskColor="oklch(0 0 0 / 45%)"
              nodeClassName={() => "!fill-muted-foreground"}
            />
          </ReactFlow>
        </ReactFlowProvider>
      </div>

      <div className="shrink-0 border-t border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs">
          <Group label="Mode">
            {["dark", "light"].map((m) => (
              <Chip key={m} active={m === mode} onClick={() => set({ mode: m })}>
                {m}
              </Chip>
            ))}
          </Group>

          <Group label="Palette">
            {["slate", "gruvbox"].map((p) => (
              <Chip key={p} active={p === palette} onClick={() => set({ palette: p })}>
                {p}
              </Chip>
            ))}
          </Group>

          <Group label="State">
            <Chip
              active={collapsed}
              onClick={() => set({ collapsed: collapsed ? undefined : "1" })}
            >
              Flow collapsed
            </Chip>
            <Chip active={dragging} onClick={() => set({ dragging: dragging ? undefined : "1" })}>
              Dragging from a Source
            </Chip>
          </Group>

        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Settled:</span>
          <LegendItem icon={SCENE_ICON} label="Scene" />
          <LegendItem icon={FLOW_ICON} label="Flow" />
          <LegendItem icon={TRANSFORMER_ICON} label="Transformer" />
          <LegendItem icon={DEVICE_ICON.single} label="Device (single)" />
          <LegendItem icon={DEVICE_ICON.audience} label="Device (audience)" />
          <LegendItem icon={DEFAULT_SCENE_ICON} label="Default Scene" />
          <LegendItem icon={TriangleAlert} label="Dangling input" destructive />

          <span className="ml-4 font-medium text-foreground">Source types:</span>
          {SOURCE_TYPES.map((t) => (
            <LegendItem key={t} icon={SOURCE_ICONS[t]} label={t} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LegendItem({
  icon: Icon,
  label,
  destructive,
}: {
  icon: LucideIcon;
  label: string;
  destructive?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon className={cn("size-4", destructive && "text-destructive")} />
      {label}
    </span>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex gap-1">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-1 transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}
