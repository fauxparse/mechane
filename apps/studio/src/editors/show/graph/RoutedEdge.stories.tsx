import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState, type PointerEvent } from "react";

import { EDGE_STROKE_WIDTH, RoutedEdge, type OffsetsBySignature } from "./RoutedEdge";
import { dragRoute, edgeGeometry, type HandleOffsets } from "./edge-path";
import { edgeStatus } from "./edge-status";
import {
  DEFAULT_MARGIN,
  DEFAULT_MAX_RADIUS,
  routeSignature,
  routeSmoothStep,
  type Endpoint,
  type Rect,
  type Side,
} from "./edge-routing";

const SIDES: readonly Side[] = ["right", "bottom", "left", "top"];

const SOURCE_COLOR = "#e11d48";
const TARGET_COLOR = "#0284c7";

/** A node box with its handle at the middle of `side`. */
function endpointAt(rect: Rect, side: Side): Endpoint {
  const point = {
    right: { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
    left: { x: rect.x, y: rect.y + rect.height / 2 },
    top: { x: rect.x + rect.width / 2, y: rect.y },
    bottom: { x: rect.x + rect.width / 2, y: rect.y + rect.height },
  }[side];
  return { point, side, rect };
}

type DebugProps = {
  margin: number;
  maxRadius: number;
  showPolyline: boolean;
  showMargins: boolean;
  alwaysShowHandles: boolean;
};

/** The raw geometry, drawn over the top. Every bug in this thing is a geometry bug. */
function DebugOverlay({
  source,
  target,
  offsets,
  margin,
  obstacles,
  showPolyline,
  showMargins,
}: {
  source: Endpoint;
  target: Endpoint;
  offsets: OffsetsBySignature;
  margin: number;
  obstacles?: readonly Rect[];
  showPolyline: boolean;
  showMargins: boolean;
}) {
  const route = routeSmoothStep(source, target, { margin, obstacles });
  const { points } = dragRoute(route.points, offsets[route.signature] ?? {}, { margin });

  return (
    <g pointerEvents="none">
      {showMargins
        ? [source.rect, target.rect].map((rect, index) => (
            <rect
              key={index}
              x={rect.x - margin}
              y={rect.y - margin}
              width={rect.width + margin * 2}
              height={rect.height + margin * 2}
              fill="none"
              stroke="#94a3b8"
              strokeDasharray="3 3"
            />
          ))
        : null}
      {showPolyline ? (
        <>
          <polyline
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke="#94a3b8"
            strokeWidth={1}
          />
          {points.map((point, index) => (
            <circle key={index} cx={point.x} cy={point.y} r={2} fill="#94a3b8" />
          ))}
        </>
      ) : null}
    </g>
  );
}

function NodeBox({ rect, color }: { rect: Rect; color: string }) {
  return (
    <rect
      {...rect}
      rx={6}
      fill={`color-mix(in oklch, ${color} 12%, white)`}
      stroke={color}
      strokeWidth={EDGE_STROKE_WIDTH}
    />
  );
}

/** One route, sized to whatever it needs. */
function Tile({
  sourceRect,
  targetRect,
  sourceSide,
  targetSide,
  obstacles,
  offsets,
  onOffsetsChange,
  label,
  labelColor,
  labelTitle,
  padding = 44,
  ...debug
}: DebugProps & {
  sourceRect: Rect;
  targetRect: Rect;
  sourceSide: Side;
  targetSide: Side;
  obstacles?: readonly Rect[];
  offsets?: OffsetsBySignature;
  onOffsetsChange?: (signature: string, next: HandleOffsets) => void;
  label?: string;
  labelColor?: string;
  labelTitle?: string;
  padding?: number;
}) {
  const source = endpointAt(sourceRect, sourceSide);
  const target = endpointAt(targetRect, targetSide);
  const held = offsets ?? {};

  const boxes = [sourceRect, targetRect, ...(obstacles ?? [])];
  const left = Math.min(...boxes.map((r) => r.x)) - padding;
  const top = Math.min(...boxes.map((r) => r.y)) - padding;
  const right = Math.max(...boxes.map((r) => r.x + r.width)) + padding;
  const bottom = Math.max(...boxes.map((r) => r.y + r.height)) + padding;

  return (
    <svg
      viewBox={`${left} ${top} ${right - left} ${bottom - top}`}
      className="w-full"
      style={{ overflow: "visible" }}
    >
      {obstacles?.map((rect, index) => (
        <rect key={index} {...rect} fill="#f1f5f9" stroke="#cbd5e1" strokeDasharray="4 3" />
      ))}
      <NodeBox rect={sourceRect} color={SOURCE_COLOR} />
      <NodeBox rect={targetRect} color={TARGET_COLOR} />
      <RoutedEdge
        source={source}
        target={target}
        sourceColor={SOURCE_COLOR}
        targetColor={TARGET_COLOR}
        offsets={held}
        onOffsetsChange={(signature, next) => onOffsetsChange?.(signature, next)}
        margin={debug.margin}
        maxRadius={debug.maxRadius}
        obstacles={obstacles}
        alwaysShowHandles={debug.alwaysShowHandles}
        label={label}
        labelColor={labelColor}
        labelTitle={labelTitle}
      />
      <DebugOverlay
        source={source}
        target={target}
        offsets={held}
        margin={debug.margin}
        obstacles={obstacles}
        showPolyline={debug.showPolyline}
        showMargins={debug.showMargins}
      />
    </svg>
  );
}

const meta: Meta<DebugProps> = {
  title: "studio/Show graph/Routed edge",
  parameters: { layout: "padded" },
  args: {
    margin: DEFAULT_MARGIN,
    maxRadius: DEFAULT_MAX_RADIUS,
    showPolyline: false,
    showMargins: false,
    alwaysShowHandles: true,
  },
  argTypes: {
    margin: { control: { type: "range", min: 0, max: 48, step: 1 } },
    maxRadius: { control: { type: "range", min: 0, max: 32, step: 1 } },
  },
};

export default meta;
type Story = StoryObj<DebugProps>;

const SMALL = { width: 96, height: 32 };

const PLACEMENTS = {
  "target ahead": { x: 220, y: 96 },
  "target behind": { x: -220, y: 96 },
  "target aligned": { x: 220, y: 0 },
} as const;

/**
 * Every handle-side pairing at three relative placements. This is the sheet
 * that finds the three combinations producing something insane, in one glance
 * — dragging a single edge around for ten minutes never does.
 */
export const SideMatrix: Story = {
  render: (args) => (
    <div className="flex flex-col gap-8">
      {Object.entries(PLACEMENTS).map(([placement, offset]) => (
        <section key={placement}>
          <h2 className="mb-2 font-semibold text-sm">{placement}</h2>
          <div className="grid grid-cols-4 gap-3">
            {SIDES.flatMap((sourceSide) =>
              SIDES.map((targetSide) => (
                <figure
                  key={`${sourceSide}-${targetSide}`}
                  className="rounded border border-slate-200 p-2"
                >
                  <Tile
                    {...args}
                    sourceRect={{ x: 0, y: 0, ...SMALL }}
                    targetRect={{ x: offset.x, y: offset.y, ...SMALL }}
                    sourceSide={sourceSide}
                    targetSide={targetSide}
                  />
                  <figcaption className="mt-1 text-[10px] text-slate-500">
                    {sourceSide} → {targetSide}
                  </figcaption>
                </figure>
              )),
            )}
          </div>
        </section>
      ))}
    </div>
  ),
};

/**
 * Every status an edge can wear, drawn by the same `edgeStatus` the editor
 * uses — so a badge that changes here has changed on the canvas too. Hover a
 * badge for the tooltip that carries the meaning the glyph can only hint at.
 */
export const StatusBadges: Story = {
  args: { alwaysShowHandles: true },
  render: (args) => (
    <div className="grid grid-cols-2 gap-3">
      {(
        [
          ["nothing to report", {}],
          ["coercing", { coercing: true }],
          ["first item", { conversion: "firstItem" }],
          [
            "first item, empty list",
            {
              conversion: "firstItem",
              warningReason:
                "This connection takes the first item of a list that is empty, so nothing is fed.",
            },
          ],
          ["incompatible", { invalidReason: "Incompatible types" }],
        ] as const
      ).map(([caption, overrides]) => {
        const status = edgeStatus({
          kind: "wiring",
          targetVariableId: null,
          coercing: false,
          conversion: null,
          invalidReason: null,
          warningReason: null,
          color: "neutral",
          sourceColor: "neutral",
          targetColor: "neutral",
          layout: null,
          parallelIndex: 0,
          parallelCount: 1,
          ...overrides,
        });
        return (
          <figure key={caption} className="rounded border border-slate-200 p-2">
            <Tile
              {...args}
              sourceRect={{ x: 0, y: 0, ...SMALL }}
              targetRect={{ x: 220, y: 96, ...SMALL }}
              sourceSide="right"
              targetSide="left"
              label={status.glyph}
              labelColor={status.color}
              labelTitle={status.title}
            />
            <figcaption className="mt-1 text-[10px] text-slate-500">{caption}</figcaption>
          </figure>
        );
      })}
    </div>
  ),
};

/** Boxes closer together than twice the margin: both stubs squeeze, no straight-line bail-out. */
export const CrampedLayouts: Story = {
  args: { showMargins: true, showPolyline: true },
  render: (args) => (
    <div className="grid grid-cols-4 gap-3">
      {[4, 12, 24, 60].map((gap) => (
        <figure key={gap} className="rounded border border-slate-200 p-2">
          <Tile
            {...args}
            sourceRect={{ x: 0, y: 0, ...SMALL }}
            targetRect={{ x: SMALL.width + gap, y: 70, ...SMALL }}
            sourceSide="right"
            targetSide="left"
          />
          <figcaption className="mt-1 text-[10px] text-slate-500">{gap}px gap</figcaption>
        </figure>
      ))}
    </div>
  ),
};

/** An obstacle may slide a run sideways. It may never add a bend. */
export const Obstacles: Story = {
  args: { showMargins: true },
  render: (args) => (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: "clear", rect: { x: 150, y: 200, width: 60, height: 60 } },
        { label: "astride the run", rect: { x: 150, y: 40, width: 60, height: 60 } },
        { label: "unavoidable", rect: { x: 110, y: -60, width: 140, height: 260 } },
      ].map(({ label, rect }) => (
        <figure key={label} className="rounded border border-slate-200 p-2">
          <Tile
            {...args}
            sourceRect={{ x: 0, y: 0, ...SMALL }}
            targetRect={{ x: 280, y: 120, ...SMALL }}
            sourceSide="right"
            targetSide="left"
            obstacles={[rect]}
          />
          <figcaption className="mt-1 text-[10px] text-slate-500">{label}</figcaption>
        </figure>
      ))}
    </div>
  ),
};

const NODE = { width: 240, height: 56 };

/**
 * Parallel edges: the domain allows several Navigate edges between one pair of
 * Scenes, one per Cue/Action pairing (#20). Identical endpoints route
 * identically, so each edge steps aside from the route they would otherwise
 * share. Aligned Scenes are the hard case — a straight line has no middle run
 * to move, so one is cut into it.
 */
export const ParallelEdges: Story = {
  args: { alwaysShowHandles: false },
  render: (args) => (
    <div className="grid grid-cols-2 gap-3">
      {[
        { label: "aligned: a jog is cut in", offset: { x: 420, y: 0 } },
        { label: "offset: the middle run steps aside", offset: { x: 420, y: 120 } },
      ].map(({ label, offset }) => {
        const sourceRect = { x: 0, y: 0, ...SMALL };
        const targetRect = { x: offset.x, y: offset.y, ...SMALL };
        const source = endpointAt(sourceRect, "right");
        const target = endpointAt(targetRect, "left");
        const count = 3;
        return (
          <figure key={label} className="rounded border border-slate-200 p-2">
            <svg viewBox="-50 -90 620 260" className="w-full" style={{ overflow: "visible" }}>
              <NodeBox rect={sourceRect} color={SOURCE_COLOR} />
              <NodeBox rect={targetRect} color={TARGET_COLOR} />
              {Array.from({ length: count }, (_, index) => (
                <RoutedEdge
                  key={index}
                  source={source}
                  target={target}
                  sourceColor={SOURCE_COLOR}
                  targetColor={TARGET_COLOR}
                  fan={(index - (count - 1) / 2) * 16}
                  margin={args.margin}
                  maxRadius={args.maxRadius}
                  alwaysShowHandles={args.alwaysShowHandles}
                />
              ))}
            </svg>
            <figcaption className="mt-1 text-[10px] text-slate-500">{label}</figcaption>
          </figure>
        );
      })}
    </div>
  ),
};

type JogCase = { label: string; target: { x: number; y: number }; offsets: HandleOffsets };

const JOG_CASES: JogCase[] = [
  { label: "HVH: nothing dragged", target: { x: 420, y: 160 }, offsets: {} },
  {
    label: "HVH → HVHVH: first run pulled up",
    target: { x: 420, y: 160 },
    offsets: { 0: -90 },
  },
  {
    label: "HVH → HVHVH: last run pushed down",
    target: { x: 420, y: 160 },
    offsets: { 2: 90 },
  },
  { label: "both ends dragged", target: { x: 420, y: 160 }, offsets: { 0: -90, 2: 90 } },
  { label: "H: one handle in the middle", target: { x: 420, y: 0 }, offsets: {} },
  { label: "H → HVHVH: jogged at both ends", target: { x: 420, y: 0 }, offsets: { 0: -80 } },
];

/**
 * Jogs: what a drag on a run that touches a node does.
 *
 * The run can't tow the node's handle with it, so it cuts two extra segments
 * in instead — a stub stays put and the rest steps aside. This is the only
 * shape change a drag can make, and the reason an HVH route can get around
 * something parked between its ends. A straight route jogs at both ends at
 * once, because both of its ends are a node; it has to, since an HVH between
 * two handles on the same line would need a V of no length at all.
 *
 * These are drawn from saved offsets rather than dragged, so the shapes are
 * the ones the geometry produces, not ones a mouse happened to find.
 */
export const EndRunJogs: Story = {
  args: { alwaysShowHandles: true, showPolyline: true },
  render: (args) => (
    <div className="grid grid-cols-2 gap-3">
      {JOG_CASES.map(({ label, target, offsets }) => {
        const sourceRect = { x: 0, y: 0, ...SMALL };
        const targetRect = { ...target, ...SMALL };
        // The offsets are filed under the shape the router produced, which is
        // the whole point of the signature: look it up rather than guess it.
        const signature = routeSmoothStep(
          endpointAt(sourceRect, "right"),
          endpointAt(targetRect, "left"),
          { margin: args.margin },
        ).signature;
        return (
          <figure key={label} className="rounded border border-slate-200 p-2">
            <Tile
              {...args}
              sourceRect={sourceRect}
              targetRect={targetRect}
              sourceSide="right"
              targetSide="left"
              offsets={{ [signature]: offsets }}
              padding={110}
            />
            <figcaption className="mt-1 text-[10px] text-slate-500">{label}</figcaption>
          </figure>
        );
      })}
    </div>
  ),
};

/**
 * Drag the nodes, drag the obstacle, drag the handles.
 *
 * Every run that touches a node carries a handle too, and dragging one cuts a
 * **jog** into the route instead of towing the node's handle with it: HVH
 * becomes HVHVH, which is how an edge gets around the box parked between its
 * two ends. Park the obstacle on the route and pull the first run clear of it.
 *
 * The readouts are the two shapes that matter. `stored` is the signature the
 * offsets are filed under — the *routed* shape, before any drag — and `drawn`
 * is what the drag made of it. Drag a handle back onto its line and `drawn`
 * flattens again while the pointer is still down: what you see there is what
 * releasing commits.
 */
export const Playground: Story = {
  args: { alwaysShowHandles: false, showMargins: true, showPolyline: true },
  render: function Render(args) {
    const [sourceRect, setSourceRect] = useState<Rect>({ x: 60, y: 60, ...NODE });
    const [targetRect, setTargetRect] = useState<Rect>({ x: 520, y: 300, ...NODE });
    const [obstacleRect, setObstacleRect] = useState<Rect>({ x: 320, y: 160, ...NODE });
    const [sourceSide, setSourceSide] = useState<Side>("right");
    const [targetSide, setTargetSide] = useState<Side>("left");
    const [offsets, setOffsets] = useState<OffsetsBySignature>({});
    const [committed, setCommitted] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [avoiding, setAvoiding] = useState(true);

    const source = endpointAt(sourceRect, sourceSide);
    const target = endpointAt(targetRect, targetSide);
    const obstacles = useMemo(() => (avoiding ? [obstacleRect] : []), [avoiding, obstacleRect]);

    const route = useMemo(
      () => routeSmoothStep(source, target, { margin: args.margin, obstacles }),
      [source, target, args.margin, obstacles],
    );
    const active = offsets[route.signature] ?? {};
    const dragged = dragRoute(route.points, active, { margin: args.margin });
    const geometry = edgeGeometry(dragged.points, { maxRadius: args.maxRadius });

    const dragNode =
      (rect: Rect, set: (next: Rect) => void) => (event: PointerEvent<SVGGElement>) => {
        // A press the edge already claimed — a handle grab — is not a node drag.
        if (event.defaultPrevented) return;
        const element = event.currentTarget;
        element.setPointerCapture(event.pointerId);

        // The group's own CTM rather than the <svg>'s: the zoom transform
        // between them scales the canvas and belongs in the conversion.
        const ctm = element.getScreenCTM();
        const scale = ctm ? Math.hypot(ctm.a, ctm.b) || 1 : 1;
        const origin = { x: event.clientX, y: event.clientY };
        const start = rect;

        const move = (moved: globalThis.PointerEvent) => {
          set({
            ...start,
            x: start.x + (moved.clientX - origin.x) / scale,
            y: start.y + (moved.clientY - origin.y) / scale,
          });
        };
        // pointercancel included, or a cancelled gesture leaves the node
        // following the pointer around for the rest of the session.
        const finish = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", finish);
          window.removeEventListener("pointercancel", finish);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", finish);
        window.addEventListener("pointercancel", finish);
      };

    return (
      <div className="flex gap-4">
        <svg viewBox="0 0 900 520" className="flex-1 rounded border border-slate-200 bg-white">
          {/* Zoom about the middle of the viewport, the way a canvas does.
              Everything below is in canvas units and scales together, so the
              stroke thickens with the zoom exactly as React Flow's does. */}
          <g transform={`translate(450 260) scale(${zoom}) translate(-450 -260)`}>
            <g onPointerDown={dragNode(sourceRect, setSourceRect)} style={{ cursor: "grab" }}>
              <NodeBox rect={sourceRect} color={SOURCE_COLOR} />
            </g>
            <g onPointerDown={dragNode(targetRect, setTargetRect)} style={{ cursor: "grab" }}>
              <NodeBox rect={targetRect} color={TARGET_COLOR} />
            </g>
            {/* The box in the way. The router may only slide a run past it,
                never bend one around it — going around is the jog's job. */}
            <g onPointerDown={dragNode(obstacleRect, setObstacleRect)} style={{ cursor: "grab" }}>
              <rect
                {...obstacleRect}
                rx={6}
                fill={avoiding ? "#f1f5f9" : "#fff"}
                stroke="#cbd5e1"
                strokeDasharray="4 3"
              />
            </g>
            <RoutedEdge
              source={source}
              target={target}
              sourceColor={SOURCE_COLOR}
              targetColor={TARGET_COLOR}
              offsets={offsets}
              onOffsetsChange={(signature, next, meta) => {
                setOffsets((current) => ({ ...current, [signature]: next }));
                if (meta.committed) setCommitted((count) => count + 1);
              }}
              obstacles={obstacles}
              margin={args.margin}
              maxRadius={args.maxRadius}
              alwaysShowHandles={args.alwaysShowHandles}
              zoom={zoom}
              label="!"
              labelColor="#b91c1c"
            />
            <DebugOverlay
              source={source}
              target={target}
              offsets={offsets}
              margin={args.margin}
              showPolyline={args.showPolyline}
              showMargins={args.showMargins}
              obstacles={obstacles}
            />
          </g>
        </svg>

        <aside className="w-56 space-y-3 text-xs">
          {(
            [
              ["source", sourceSide, setSourceSide],
              ["target", targetSide, setTargetSide],
            ] as const
          ).map(([name, value, set]) => (
            <label key={name} className="block">
              <span className="mb-1 block font-semibold">{name} handle</span>
              <select
                className="w-full rounded border border-slate-300 p-1"
                value={value}
                onChange={(event) => set(event.target.value as Side)}
              >
                {SIDES.map((side) => (
                  <option key={side} value={side}>
                    {side}
                  </option>
                ))}
              </select>
            </label>
          ))}

          <label className="block">
            <span className="mb-1 flex justify-between font-semibold">
              <span>zoom</span>
              <span className="font-mono">{zoom.toFixed(2)}×</span>
            </span>
            <input
              type="range"
              className="w-full"
              min={0.2}
              max={2.5}
              step={0.05}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
            <span className="mt-1 flex gap-1">
              {[0.4, 0.5, 1, 2].map((step) => (
                <button
                  key={step}
                  type="button"
                  className="flex-1 rounded border border-slate-300 py-0.5"
                  onClick={() => setZoom(step)}
                >
                  {step}×
                </button>
              ))}
            </span>
            <span className="mt-1 block text-slate-500">
              handles and hit area hold their screen size at any zoom
            </span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={avoiding}
              onChange={(event) => setAvoiding(event.target.checked)}
            />
            <span>route avoids the grey box</span>
          </label>

          <dl className="space-y-1 rounded bg-slate-50 p-2 font-mono">
            <Readout term="routed" value={route.signature} />
            <Readout term="drawn" value={routeSignature(dragged.points)} />
            <Readout term="segments" value={String(geometry.segments.length)} />
            <Readout term="detour" value={route.detour ?? "—"} />
            <Readout
              term="handles"
              value={dragged.handles.map((handle) => handle.key).join(" ") || "none"}
            />
            <Readout
              term="dragged"
              value={
                Object.entries(active)
                  .filter(([, value]) => value !== 0)
                  .map(([index, value]) => `${index}:${Math.round(value)}`)
                  .join(" ") || "—"
              }
            />
            <Readout term="label seg" value={String(geometry.label.segmentIndex ?? "midpoint")} />
            <Readout term="commits" value={String(committed)} />
            <Readout term="stored" value={Object.keys(offsets).join(" ") || "—"} />
          </dl>

          <div className="space-y-1">
            {(
              [
                ["node in the way", { x: 60, y: 60 }, { x: 620, y: 60 }, { x: 340, y: 40 }],
                ["exact straight line", { x: 60, y: 200 }, { x: 620, y: 200 }, { x: 340, y: 400 }],
                ["step down", { x: 60, y: 60 }, { x: 520, y: 300 }, { x: 320, y: 400 }],
              ] as const
            ).map(([name, from, to, box]) => (
              <button
                key={name}
                type="button"
                className="w-full rounded border border-slate-300 p-1"
                onClick={() => {
                  setSourceRect({ ...from, ...NODE });
                  setTargetRect({ ...to, ...NODE });
                  setObstacleRect({ ...box, ...NODE });
                  setSourceSide("right");
                  setTargetSide("left");
                  setOffsets({});
                }}
              >
                {name}
              </button>
            ))}
            <button
              type="button"
              className="w-full rounded border border-slate-300 p-1"
              onClick={() => setOffsets({})}
            >
              Clear handle offsets
            </button>
          </div>
        </aside>
      </div>
    );
  },
};

function Readout({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{term}</dt>
      <dd className="text-slate-500">{value}</dd>
    </div>
  );
}

/**
 * A hundred edges at once, for the question the batch router existed to answer.
 * The routing is O(1) per edge, so this should stay smooth without memoisation.
 */
export const Stress: Story = {
  args: { alwaysShowHandles: false },
  render: (args) => {
    const edges = Array.from({ length: 100 }, (_, index) => {
      const column = index % 10;
      const row = Math.floor(index / 10);
      return {
        source: endpointAt({ x: column * 180, y: row * 120, width: 90, height: 30 }, "right"),
        target: endpointAt(
          { x: column * 180 + 110, y: row * 120 + 60, width: 90, height: 30 },
          "left",
        ),
      };
    });

    return (
      <svg viewBox="-20 -20 1840 1260" className="w-full rounded border border-slate-200 bg-white">
        {edges.map(({ source, target }, index) => (
          <g key={index}>
            <NodeBox rect={source.rect} color={SOURCE_COLOR} />
            <NodeBox rect={target.rect} color={TARGET_COLOR} />
            <RoutedEdge
              source={source}
              target={target}
              sourceColor={SOURCE_COLOR}
              targetColor={TARGET_COLOR}
              margin={args.margin}
              maxRadius={args.maxRadius}
            />
          </g>
        ))}
      </svg>
    );
  },
};
