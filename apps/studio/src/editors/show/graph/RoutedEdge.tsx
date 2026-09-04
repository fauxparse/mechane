// The drawn edge (#475): routing, rounding, handles, label and color, with no
// React Flow in sight. The React Flow edge is a thin adapter over this, which
// is what lets the whole side matrix be exercised in Storybook without a
// canvas — and what keeps the vendor's batch router out of the picture.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";

import {
  applyHandleOffsets,
  edgeGeometry,
  edgeHandles,
  type HandleOffsets,
  type Orientation,
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
  /** What the glyph means, as a tooltip on the badge that carries it. */
  labelTitle?: string;
  selected?: boolean;
  margin?: number;
  maxRadius?: number;
  obstacles?: readonly Rect[];
  /**
   * Perpendicular displacement of this edge's default route, so edges sharing
   * both handles are visibly separate. Any saved nudge applies on top of it.
   */
  fan?: number;
  /** Canvas zoom, so handles keep a constant size on screen. */
  zoom?: number;
  /** Ignores hover and selection — for stories and screenshots. */
  alwaysShowHandles?: boolean;
  strokeWidth?: number;
  markerStart?: string;
  markerEnd?: string;
  onClick?: () => void;
};

/**
 * Nodes are drawn with a 1px border, and an edge is the same kind of line as
 * the boxes it joins — so it takes the same weight rather than a heavier one
 * of its own. Exported so the stories draw their boxes with it too, and the
 * match is structural rather than two constants that happen to agree.
 */
export const EDGE_STROKE_WIDTH = 1;

/**
 * A selected edge is the same line drawn heavier. Selection is the one state
 * an edge can be in that has to read at any zoom, and weight survives being
 * scaled down where a hue on a 1px line does not.
 */
export const SELECTED_EDGE_STROKE_WIDTH = 2;

/** A chip lying along the path: grab it and slide it sideways. */
const HANDLE_LENGTH = 18;
const HANDLE_THICKNESS = 6;
const HANDLE_CORNER = 3;

/** The label's chip is a badge instead, big enough to hold a glyph. */
const LABEL_RADIUS = 10;

/** How close counts as grabbing the handle rather than what's behind it. */
const HANDLE_HIT = 26;

/** Wide enough to grab the edge without hunting for it, in screen pixels. */
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
  labelTitle,
  selected = false,
  margin = DEFAULT_MARGIN,
  maxRadius = DEFAULT_MAX_RADIUS,
  obstacles,
  fan = 0,
  zoom = 1,
  alwaysShowHandles = false,
  strokeWidth = selected ? SELECTED_EDGE_STROKE_WIDTH : EDGE_STROKE_WIDTH,
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
    () => routeSmoothStep(source, target, { margin, obstacles, fan, previousDetour }),
    [source, target, margin, obstacles, fan, previousDetour],
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
  const revealed = alwaysShowHandles || selected || hovered || dragging !== null;

  // Torn down when a drag ends, and again before any new drag starts. A
  // pointer sequence that never delivers its pointerup — a cancelled gesture,
  // a capture lost to the browser — would otherwise leave live listeners on a
  // DOM node React reuses, and every later pointermove over it, hovering
  // included, would carry on rewriting the route.
  const endDrag = useRef<(() => void) | null>(null);
  const root = useRef<SVGGElement>(null);
  useEffect(() => () => endDrag.current?.(), []);

  const drag = useCallback(
    (segmentIndex: number, orientation: "horizontal" | "vertical") =>
      (event: PointerEvent<SVGGElement>) => {
        if (!onOffsetsChange) return;
        // Both matter: the node under a handle must not start dragging itself,
        // and the browser must not treat the press as a text selection.
        event.stopPropagation();
        event.preventDefault();
        endDrag.current?.();

        const element = event.currentTarget;
        element.setPointerCapture(event.pointerId);
        setDragging(segmentIndex);

        // Pointer deltas arrive in screen pixels; offsets are in canvas units.
        // The element's own screen CTM is the honest conversion in both places
        // this renders — a React Flow viewport transform and a plain viewBox
        // scale it equally — where the `zoom` prop only knows about the first.
        const scale = screenScale(root.current);
        const axis = orientation === "vertical" ? "clientX" : "clientY";
        const origin = event[axis];
        const start = active[segmentIndex] ?? 0;
        const signature = route.signature;

        const offsetAt = (moved: globalThis.PointerEvent): HandleOffsets => ({
          ...active,
          [segmentIndex]: start + (moved[axis] - origin) / scale,
        });

        const move = (moved: globalThis.PointerEvent) => {
          onOffsetsChange(signature, offsetAt(moved), { committed: false });
        };
        const finish = (released: globalThis.PointerEvent) => {
          onOffsetsChange(signature, offsetAt(released), { committed: true });
          cleanup();
        };
        const cleanup = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", finish);
          window.removeEventListener("pointercancel", cleanup);
          endDrag.current = null;
          setDragging(null);
        };

        // On window rather than the element: pointer capture retargets the
        // events here anyway, and a drag that leaves the canvas still ends.
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", finish);
        window.addEventListener("pointercancel", cleanup);
        endDrag.current = cleanup;
      },
    [active, onOffsetsChange, route.signature],
  );

  const labelSegment =
    geometry.label.segmentIndex === null ? null : geometry.segments[geometry.label.segmentIndex];

  return (
    <g
      ref={root}
      className="routed-edge"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {/* One fat invisible run over the whole route: the hit area for hover
          and click, and the reason reaching for a handle never dismisses it.
          Counter-scaled like the handles are, so the edge stays as easy to
          hit zoomed out as zoomed in — in canvas units it would shrink with
          everything else, and a 1px line would need pixel-hunting. */}
      <path
        d={geometry.segments.map((segment) => segment.d).join(" ")}
        fill="none"
        stroke="transparent"
        strokeWidth={INTERACTION_WIDTH / zoom}
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
        // Carrying the label makes this handle a status marker as well as a
        // grab affordance, and a marker that hides until you hover it reports
        // the problem only to whoever already suspected one. So it stays
        // drawn — through the zoom floor too, since scanning a whole graph
        // zoomed out is exactly when an invalid edge needs to stand out.
        // Only when it has something to say: with no glyph there is no marker,
        // and the handle goes back to behaving like every other one.
        const isMarker = handle.segmentIndex === geometry.label.segmentIndex && Boolean(label);
        const shown = isMarker || revealed;
        return (
          <g
            key={handle.segmentIndex}
            transform={`translate(${handle.point.x} ${handle.point.y}) scale(${1 / zoom})`}
            onPointerDown={drag(handle.segmentIndex, handle.orientation)}
            style={{
              cursor: handle.orientation === "vertical" ? "ew-resize" : "ns-resize",
              // Fades in, but grabbable from the first frame: a fast reach for
              // a handle must never fall through to the canvas behind it.
              opacity: shown ? 1 : 0,
              transition: "opacity 120ms ease-out",
              pointerEvents: shown || alwaysShowHandles ? "auto" : "none",
            }}
          >
            {/* The grab target, well wider than the chip. A near-miss lands on
                whatever is behind the edge — usually one of the nodes it
                connects, which then starts dragging instead. */}
            <rect
              x={-HANDLE_HIT / 2}
              y={-HANDLE_HIT / 2}
              width={HANDLE_HIT}
              height={HANDLE_HIT}
              fill="transparent"
            />
            {isMarker ? (
              <Badge
                color={blend(
                  sourceColor,
                  targetColor,
                  positionOf(geometry.segments, handle.segmentIndex),
                )}
                title={labelTitle}
              >
                <LabelGlyph color={labelColor}>{label}</LabelGlyph>
              </Badge>
            ) : (
              <Chip
                orientation={handle.orientation}
                color={blend(
                  sourceColor,
                  targetColor,
                  positionOf(geometry.segments, handle.segmentIndex),
                )}
              />
            )}
          </g>
        );
      })}

      {/* A route with no interior segment has nothing to drag, so its label is
          drawn on its own at the midpoint of the path. */}
      {label && !labelSegment ? (
        <g
          transform={`translate(${geometry.label.point.x} ${geometry.label.point.y}) scale(${1 / zoom})`}
        >
          <Badge color={blend(sourceColor, targetColor, 0.5)} title={labelTitle}>
            <LabelGlyph color={labelColor}>{label}</LabelGlyph>
          </Badge>
        </g>
      ) : null}
    </g>
  );
}

/** The plain handle: a rounded bar lying along the run it moves. */
function Chip({ orientation, color }: { orientation: Orientation; color: string }) {
  const along = orientation === "vertical" ? HANDLE_THICKNESS : HANDLE_LENGTH;
  const across = orientation === "vertical" ? HANDLE_LENGTH : HANDLE_THICKNESS;
  return (
    <rect
      x={-along / 2}
      y={-across / 2}
      width={along}
      height={across}
      rx={HANDLE_CORNER}
      fill="var(--background, #fff)"
      stroke={color}
      strokeWidth={EDGE_STROKE_WIDTH}
    />
  );
}

/** The handle that carries the label: the same treatment, sized for a glyph. */
function Badge({ color, title, children }: { color: string; title?: string; children: ReactNode }) {
  return (
    <>
      {/* A glyph small enough to fit a 20px badge can only ever hint at what
          it means; the tooltip is where it says so. */}
      {title ? <title>{title}</title> : null}
      <circle
        r={LABEL_RADIUS}
        fill="var(--background, #fff)"
        stroke={color}
        strokeWidth={EDGE_STROKE_WIDTH}
      />
      {children}
    </>
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

/**
 * Screen pixels per canvas unit, read from the edge's own group.
 *
 * Not from the `<svg>`: anything between the two — a zoom transform on a
 * wrapping group — scales the canvas and belongs in the conversion. Not from
 * the handle either, which counter-scales itself and would cancel out the very
 * factor being measured.
 */
function screenScale(element: SVGGraphicsElement | null): number {
  const matrix = element?.getScreenCTM();
  if (!matrix) return 1;
  return Math.hypot(matrix.a, matrix.b) || 1;
}

function positionOf(segments: readonly Segment[], index: number): number {
  return segments[index]?.position ?? 0;
}

/**
 * One flat color per segment rather than a real gradient. `color-mix` keeps
 * the blend in CSS, so both ends stay palette tokens and follow the theme.
 */
function blend(from: string, to: string, position: number): string {
  if (from === to || position <= 0) return from;
  if (position >= 1) return to;
  return `color-mix(in oklch, ${to} ${Math.round(position * 100)}%, ${from})`;
}
