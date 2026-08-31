// The drawn edge (#475): routing, rounding, handles, label and color, with no
// React Flow in sight. The React Flow edge is a thin adapter over this, which
// is what lets the whole side matrix be exercised in Storybook without a
// canvas — and what keeps the vendor's batch router out of the picture.

import { useCallback, useEffect, useMemo, useState, type PointerEvent, type ReactNode } from "react";

import {
  applyHandleOffsets,
  edgeGeometry,
  edgeHandles,
  type HandleOffsets,
  type Segment,
} from "./edge-path";
import {
  DEFAULT_MARGIN,
  DEFAULT_MAX_RADIUS,
  routeSmoothStep,
  type DetourSide,
  type Endpoint,
  type Rect,
} from "./edge-routing";

/**
 * Saved handle nudges, keyed by the shape signature of the route they were
 * placed on. A route that changes shape leaves its offsets dormant here rather
 * than applying an index that no longer means the same thing; a route that
 * changes back picks them up again.
 */
export type OffsetsBySignature = Readonly<Record<string, HandleOffsets>>;

export type RoutedEdgeProps = {
  source: Endpoint;
  target: Endpoint;
  /** Resolved colors of the source and target nodes, blended across the run. */
  sourceColor: string;
  targetColor: string;
  offsets?: OffsetsBySignature;
  /**
   * `committed` is false while a drag is in flight and true on release. Only a
   * committed change is worth an undo entry; the rest is live preview.
   */
  onOffsetsChange?: (
    signature: string,
    offsets: HandleOffsets,
    meta: { committed: boolean },
  ) => void;
  /** The status glyph, drawn in the label slot. */
  label?: ReactNode;
  labelColor?: string;
  selected?: boolean;
  margin?: number;
  maxRadius?: number;
  obstacles?: readonly Rect[];
  /** Canvas zoom, so handles keep a constant size on screen. */
  zoom?: number;
  /** Ignores hover and selection — for stories and screenshots. */
  alwaysShowHandles?: boolean;
  strokeWidth?: number;
  markerStart?: string;
  markerEnd?: string;
  onClick?: () => void;
};

/** Precision editing is meaningless this far out, so the handles get out of the way. */
const MIN_HANDLE_ZOOM = 0.5;

const HANDLE_RADIUS = 5;

/** Wide enough to grab the edge without hunting for it. */
const INTERACTION_WIDTH = 20;

/** Shared empties, so "nothing saved here" stays referentially stable across renders. */
const EMPTY_OFFSETS: HandleOffsets = {};
const NO_OFFSETS: OffsetsBySignature = {};

export function RoutedEdge({
  source,
  target,
  sourceColor,
  targetColor,
  offsets = NO_OFFSETS,
  onOffsetsChange,
  label,
  labelColor,
  selected = false,
  margin = DEFAULT_MARGIN,
  maxRadius = DEFAULT_MAX_RADIUS,
  obstacles,
  zoom = 1,
  alwaysShowHandles = false,
  strokeWidth = 2,
  markerStart,
  markerEnd,
  onClick,
}: RoutedEdgeProps) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);

  // The detour a route took last time. Feeding it back is what stops an edge
  // flipping from one side of the nodes to the other mid-drag. It is state
  // rather than a ref because the route is derived from it: writing it during
  // render would make what gets drawn depend on how often React renders.
  const [previousDetour, setPreviousDetour] = useState<DetourSide | null>(null);

  const route = useMemo(
    () => routeSmoothStep(source, target, { margin, obstacles, previousDetour }),
    [source, target, margin, obstacles, previousDetour],
  );

  useEffect(() => {
    setPreviousDetour(route.detour);
  }, [route.detour]);

  const active = useMemo(
    () => offsets[route.signature] ?? EMPTY_OFFSETS,
    [offsets, route.signature],
  );
  const geometry = useMemo(
    () => edgeGeometry(applyHandleOffsets(route.points, active, { margin }), { maxRadius }),
    [route.points, active, margin, maxRadius],
  );

  const handles = edgeHandles(geometry);
  const revealed =
    alwaysShowHandles || ((selected || hovered || dragging !== null) && zoom >= MIN_HANDLE_ZOOM);

  const drag = useCallback(
    (segmentIndex: number, orientation: "horizontal" | "vertical") =>
      (event: PointerEvent<SVGGElement>) => {
        if (!onOffsetsChange) return;
        event.stopPropagation();

        const element = event.currentTarget;
        element.setPointerCapture(event.pointerId);
        setDragging(segmentIndex);

        const origin = orientation === "vertical" ? event.clientX : event.clientY;
        const start = active[segmentIndex] ?? 0;
        const signature = route.signature;

        const move = (moved: globalThis.PointerEvent) => {
          const now = orientation === "vertical" ? moved.clientX : moved.clientY;
          onOffsetsChange(
            signature,
            { ...active, [segmentIndex]: start + (now - origin) / zoom },
            { committed: false },
          );
        };
        const finish = (released: globalThis.PointerEvent) => {
          const now = orientation === "vertical" ? released.clientX : released.clientY;
          onOffsetsChange(
            signature,
            { ...active, [segmentIndex]: start + (now - origin) / zoom },
            { committed: true },
          );
          setDragging(null);
          element.removeEventListener("pointermove", move);
          element.removeEventListener("pointerup", finish);
        };

        element.addEventListener("pointermove", move);
        element.addEventListener("pointerup", finish);
      },
    [active, onOffsetsChange, route.signature, zoom],
  );

  const labelSegment =
    geometry.label.segmentIndex === null ? null : geometry.segments[geometry.label.segmentIndex];

  return (
    <g
      className="routed-edge"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {/* One fat invisible run over the whole route: the hit area for hover
          and click, and the reason reaching for a handle never dismisses it. */}
      <path
        d={geometry.segments.map((segment) => segment.d).join(" ")}
        fill="none"
        stroke="transparent"
        strokeWidth={INTERACTION_WIDTH}
      />

      {geometry.segments.map((segment) => (
        <path
          key={segment.index}
          d={segment.d}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          stroke={blend(sourceColor, targetColor, segment.position)}
          markerStart={segment.index === 0 ? markerStart : undefined}
          markerEnd={segment.index === geometry.segments.length - 1 ? markerEnd : undefined}
        />
      ))}

      {handles.map((handle) => {
        const isLabel = handle.segmentIndex === geometry.label.segmentIndex;
        return (
          <g
            key={handle.segmentIndex}
            transform={`translate(${handle.point.x} ${handle.point.y}) scale(${1 / zoom})`}
            onPointerDown={drag(handle.segmentIndex, handle.orientation)}
            style={{
              cursor: handle.orientation === "vertical" ? "ew-resize" : "ns-resize",
              // Fades in, but grabbable from the first frame: a fast reach for
              // a handle must never fall through to the canvas behind it.
              opacity: revealed ? 1 : 0,
              transition: "opacity 120ms ease-out",
              pointerEvents: revealed || alwaysShowHandles ? "auto" : "none",
            }}
          >
            <circle
              r={HANDLE_RADIUS}
              fill="var(--background, #fff)"
              stroke={blend(sourceColor, targetColor, positionOf(geometry.segments, handle.segmentIndex))}
              strokeWidth={2}
            />
            {isLabel && label ? <LabelGlyph color={labelColor}>{label}</LabelGlyph> : null}
          </g>
        );
      })}

      {/* A route with no interior segment has nothing to drag, so its label is
          drawn on its own at the midpoint of the path. */}
      {label && !labelSegment ? (
        <g
          transform={`translate(${geometry.label.point.x} ${geometry.label.point.y}) scale(${1 / zoom})`}
        >
          <circle r={HANDLE_RADIUS + 3} fill="var(--background, #fff)" />
          <LabelGlyph color={labelColor}>{label}</LabelGlyph>
        </g>
      ) : null}
    </g>
  );
}

function LabelGlyph({ color, children }: { color?: string; children: ReactNode }) {
  return (
    <text
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={700}
      fill={color ?? "currentColor"}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      {children}
    </text>
  );
}

function positionOf(segments: readonly Segment[], index: number): number {
  return segments[index]?.position ?? 0;
}

/**
 * One flat color per segment rather than a real gradient. `color-mix` keeps
 * the blend in CSS, so both ends stay palette tokens and follow the theme.
 */
function blend(from: string, to: string, position: number): string {
  if (from === to) return from;
  return `color-mix(in oklch, ${to} ${Math.round(position * 100)}%, ${from})`;
}
