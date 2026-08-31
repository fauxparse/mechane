import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState, type PointerEvent } from "react";

import { EDGE_STROKE_WIDTH, RoutedEdge, type OffsetsBySignature } from "./RoutedEdge";
import { applyHandleOffsets, edgeGeometry, type HandleOffsets } from "./edge-path";
import {
  DEFAULT_MARGIN,
  DEFAULT_MAX_RADIUS,
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
  const points = applyHandleOffsets(route.points, offsets[route.signature] ?? {}, { margin });

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
 * Drag the nodes, drag the handles. The readout is the shape signature the
 * handle offsets are stored against — move a node far enough that the shape
 * changes and the offsets go dormant rather than landing somewhere absurd.
 */
export const Playground: Story = {
  args: { alwaysShowHandles: false, showMargins: true, showPolyline: true },
  render: function Render(args) {
    const [sourceRect, setSourceRect] = useState<Rect>({ x: 60, y: 60, ...NODE });
    const [targetRect, setTargetRect] = useState<Rect>({ x: 520, y: 300, ...NODE });
    const [sourceSide, setSourceSide] = useState<Side>("right");
    const [targetSide, setTargetSide] = useState<Side>("left");
    const [offsets, setOffsets] = useState<OffsetsBySignature>({});
    const [committed, setCommitted] = useState(0);

    const source = endpointAt(sourceRect, sourceSide);
    const target = endpointAt(targetRect, targetSide);

    const route = useMemo(
      () => routeSmoothStep(source, target, { margin: args.margin }),
      [source, target, args.margin],
    );
    const geometry = edgeGeometry(
      applyHandleOffsets(route.points, offsets[route.signature] ?? {}, { margin: args.margin }),
      { maxRadius: args.maxRadius },
    );

    const dragNode =
      (rect: Rect, set: (next: Rect) => void) => (event: PointerEvent<SVGGElement>) => {
        // A press the edge already claimed — a handle grab — is not a node drag.
        if (event.defaultPrevented) return;
        const element = event.currentTarget;
        element.setPointerCapture(event.pointerId);

        const svg = element.ownerSVGElement?.getScreenCTM();
        const scale = svg ? Math.hypot(svg.a, svg.b) || 1 : 1;
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
          <g onPointerDown={dragNode(sourceRect, setSourceRect)} style={{ cursor: "grab" }}>
            <NodeBox rect={sourceRect} color={SOURCE_COLOR} />
          </g>
          <g onPointerDown={dragNode(targetRect, setTargetRect)} style={{ cursor: "grab" }}>
            <NodeBox rect={targetRect} color={TARGET_COLOR} />
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
            margin={args.margin}
            maxRadius={args.maxRadius}
            alwaysShowHandles={args.alwaysShowHandles}
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
          />
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

          <dl className="space-y-1 rounded bg-slate-50 p-2 font-mono">
            <Readout term="signature" value={route.signature} />
            <Readout term="segments" value={String(geometry.segments.length)} />
            <Readout term="detour" value={route.detour ?? "—"} />
            <Readout
              term="handles"
              value={String(geometry.segments.filter((s) => s.draggable).length)}
            />
            <Readout term="label seg" value={String(geometry.label.segmentIndex ?? "midpoint")} />
            <Readout term="commits" value={String(committed)} />
            <Readout term="stored" value={Object.keys(offsets).join(" ") || "—"} />
          </dl>

          <button
            type="button"
            className="w-full rounded border border-slate-300 p-1"
            onClick={() => setOffsets({})}
          >
            Clear handle offsets
          </button>
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
