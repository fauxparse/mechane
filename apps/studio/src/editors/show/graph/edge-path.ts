// Turning a routed polyline into something drawable (#475).
//
// Everything an edge renders is defined on the *straight runs* of the route:
// the drag handles, the label anchor, and the per-segment colors. The rounded
// corners are decoration applied last, which is why ./edge-routing hands over
// an unrounded polyline and this module rounds it — an arc never carries a
// handle, a label, or a color of its own.

import { DEFAULT_MARGIN, DEFAULT_MAX_RADIUS, type Point } from "./edge-routing";

export type Orientation = "horizontal" | "vertical";

export type Segment = {
  index: number;
  from: Point;
  to: Point;
  orientation: Orientation;
  length: number;
  /** The middle of the straight run, ignoring the arcs at either end. */
  midpoint: Point;
  /**
   * How far along the blend from the source's color to the target's this
   * segment sits. The runs touching each node take that node's color exactly —
   * 0 for the first, 1 for the last — because a run leaving a node reads as
   * part of it. Everything between them spreads across by arc length rather
   * than by index, so a long run sits where its length says it should instead
   * of banding. A route of one single run has no end to favour, so it takes
   * the midpoint of the blend.
   */
  position: number;
  /** The `d` attribute: the straight run, plus the arc into the next segment. */
  d: string;
  /**
   * Whether this segment carries a drag handle. The first and last segments
   * never do — they're the stubs leaving each handle, and moving them would
   * detach the edge from the node it belongs to.
   */
  draggable: boolean;
};

export type EdgeGeometry = {
  segments: Segment[];
  /** Total length of the unrounded route. */
  length: number;
  /**
   * Where the label sits. `segmentIndex` is null for routes with no interior
   * segment at all, where the anchor falls back to the midpoint of the whole
   * path — and where, by the same token, there is nothing to drag.
   */
  label: { point: Point; segmentIndex: number | null };
};

export type GeometryOptions = {
  maxRadius?: number;
};

const EPSILON = 0.01;

function orientationOf(from: Point, to: Point): Orientation {
  return Math.abs(from.y - to.y) < EPSILON ? "horizontal" : "vertical";
}

function lengthOf(from: Point, to: Point): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

/** The unit vector a run travels along. */
function directionOf(from: Point, to: Point): Point {
  return { x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) };
}

function shift(point: Point, direction: Point, distance: number): Point {
  return { x: point.x + direction.x * distance, y: point.y + direction.y * distance };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function moveTo(point: Point): string {
  return `M ${round(point.x)} ${round(point.y)}`;
}

function lineTo(point: Point): string {
  return `L ${round(point.x)} ${round(point.y)}`;
}

function arcTo(corner: Point, point: Point): string {
  return `Q ${round(corner.x)} ${round(corner.y)} ${round(point.x)} ${round(point.y)}`;
}

/**
 * The corner radius at `points[index]`.
 *
 * A cap of `maxRadius`, and no more than half of the shorter of the two runs
 * meeting there, computed independently per corner. Two adjacent corners on a
 * short run therefore meet exactly in the middle of it, which is the result
 * you want: the run is fully consumed by its own curvature and nothing
 * overshoots. A run so short that its corners go square is honest — it is
 * telling you the route is cramped there.
 */
export function cornerRadius(points: readonly Point[], index: number, maxRadius: number): number {
  const previous = points[index - 1];
  const corner = points[index];
  const next = points[index + 1];
  if (!previous || !corner || !next) return 0;

  // A reversal — the route doubling back along its own axis — has no corner to
  // round, only a hairpin. Rounding it would bulge the path sideways.
  if (orientationOf(previous, corner) === orientationOf(corner, next)) return 0;

  const shorter = Math.min(lengthOf(previous, corner), lengthOf(corner, next));
  return Math.min(maxRadius, shorter / 2);
}

/** Derives everything drawable from a routed polyline. */
export function edgeGeometry(
  points: readonly Point[],
  options: GeometryOptions = {},
): EdgeGeometry {
  const maxRadius = options.maxRadius ?? DEFAULT_MAX_RADIUS;
  const count = points.length - 1;

  const radii = points.map((_, index) => cornerRadius(points, index, maxRadius));
  const lengths: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    lengths.push(from && to ? lengthOf(from, to) : 0);
  }
  const total = lengths.reduce((sum, length) => sum + length, 0);

  // The blend runs between the two runs that touch the nodes, so interior
  // runs are placed within that span rather than within the whole route.
  const first = lengths[0] ?? 0;
  const last = count > 1 ? (lengths[count - 1] ?? 0) : 0;
  const interior = total - first - last;

  const segments: Segment[] = [];
  let travelled = 0;

  for (let i = 0; i < count; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    const length = lengths[i];
    if (!from || !to || length === undefined) continue;

    const direction = directionOf(from, to);
    const startRadius = radii[i] ?? 0;
    const endRadius = radii[i + 1] ?? 0;
    const start = shift(from, direction, startRadius);
    const end = shift(to, direction, endRadius === 0 ? 0 : -endRadius);

    let d = `${moveTo(start)} ${lineTo(end)}`;
    const after = points[i + 2];
    if (endRadius > 0 && after) {
      // The arc belongs to the segment before it, so it takes that segment's
      // color and the next segment starts cleanly on the far side of the bend.
      d += ` ${arcTo(to, shift(to, directionOf(to, after), endRadius))}`;
    }

    segments.push({
      index: i,
      from,
      to,
      orientation: orientationOf(from, to),
      length,
      midpoint: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
      position: blendPosition({ index: i, count, midpoint: travelled + length / 2, first, interior }),
      d,
      draggable: i > 0 && i < count - 1,
    });
    travelled += length;
  }

  return { segments, length: total, label: labelAnchor(segments, total) };
}

/** See `Segment.position`. */
function blendPosition({
  index,
  count,
  midpoint,
  first,
  interior,
}: {
  index: number;
  count: number;
  midpoint: number;
  first: number;
  interior: number;
}): number {
  if (count === 1) return 0.5;
  if (index === 0) return 0;
  if (index === count - 1) return 1;
  if (interior <= 0) return 0.5;
  return (midpoint - first) / interior;
}

/**
 * The label goes at the centre of the centremost segment, rounding down when
 * the count is even. That index is always an interior one for any route with
 * three or more segments; below that there is no interior segment to sit on,
 * and the anchor falls back to the midpoint of the path by arc length. Not the
 * corner — the eye already goes to the corner, and a label competing with it
 * reads as clutter.
 */
function labelAnchor(
  segments: readonly Segment[],
  total: number,
): { point: Point; segmentIndex: number | null } {
  const count = segments.length;
  if (count >= 3) {
    const index = Math.floor((count - 1) / 2);
    const segment = segments[index];
    if (segment) return { point: segment.midpoint, segmentIndex: index };
  }

  let remaining = total / 2;
  for (const segment of segments) {
    if (remaining > segment.length) {
      remaining -= segment.length;
      continue;
    }
    const direction = directionOf(segment.from, segment.to);
    return { point: shift(segment.from, direction, remaining), segmentIndex: null };
  }
  const only = segments[0];
  return { point: only?.midpoint ?? { x: 0, y: 0 }, segmentIndex: null };
}

/**
 * Perpendicular nudges the user has dragged onto a route, by segment index.
 *
 * These are only ever read back against a route with a matching shape
 * signature — see `Route.signature`. An index into a route of a different
 * shape means nothing, so a shape change leaves the offsets dormant rather
 * than applying them somewhere absurd.
 */
export type HandleOffsets = Readonly<Record<number, number>>;

export type OffsetOptions = {
  /** Shortest a neighbouring run may be squeezed to by a drag. */
  margin?: number;
};

/**
 * Moves each offset segment perpendicular to itself, clamped so the runs on
 * either side keep their margin and never flip direction. A handle that can be
 * dragged into an illegal route is a handle whose illegal states you then have
 * to write recovery code for; clamping means they never arise.
 */
export function applyHandleOffsets(
  points: readonly Point[],
  offsets: HandleOffsets,
  options: OffsetOptions = {},
): Point[] {
  const margin = options.margin ?? DEFAULT_MARGIN;
  const moved = points.map((point) => ({ ...point }));

  for (const [key, requested] of Object.entries(offsets)) {
    const index = Number(key);
    const from = moved[index];
    const to = moved[index + 1];
    const before = moved[index - 1];
    const after = moved[index + 2];
    if (!from || !to || !before || !after || requested === 0) continue;

    // A vertical run is dragged horizontally, and vice versa.
    const axis = orientationOf(from, to) === "vertical" ? "x" : "y";
    const delta = clampOffset(
      requested,
      [
        // Only the stubs have a direction worth defending: one flipping would
        // send the edge backwards into the node it leaves. Every other run is
        // free to turn over, which is what lets a drag take a segment past a
        // neighbour's far end instead of stopping dead at it.
        { run: before[axis] - from[axis], stub: index - 1 === 0 },
        { run: after[axis] - to[axis], stub: index + 1 === points.length - 2 },
      ],
      margin,
    );
    from[axis] += delta;
    to[axis] += delta;
  }

  return moved;
}

/** A run next to the segment being moved: its signed length, and whether it's a stub. */
type Neighbour = { run: number; stub: boolean };

/**
 * How far a segment may actually move.
 *
 * `run` is a neighbour's signed length, measured *away* from the segment, so
 * moving by `delta` takes that neighbour to `run - delta`.
 *
 * A stub contributes a hard bound: it must keep its margin *and* its
 * direction. Any other neighbour only has to keep its margin, so instead of a
 * bound it forbids a band `2 * margin` wide around the point where it would
 * collapse. A drag crossing that band snaps through it and the run turns over
 * — which is the whole point of a handle, and is how a segment gets past the
 * far end of the run beside it rather than stopping short of it.
 */
function clampOffset(delta: number, neighbours: readonly Neighbour[], margin: number): number {
  let low = Number.NEGATIVE_INFINITY;
  let high = Number.POSITIVE_INFINITY;
  const forbidden: [number, number][] = [];

  for (const { run, stub } of neighbours) {
    if (!stub) {
      forbidden.push([run - margin, run + margin]);
    } else if (run > 0) {
      high = Math.min(high, run - margin);
    } else {
      low = Math.max(low, run + margin);
    }
  }

  const bounded = (value: number) => Math.min(high, Math.max(low, value));
  let result = bounded(delta);

  // Two neighbours at most, so two passes settle any interaction between them.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const [from, to] of forbidden) {
      if (result <= from || result >= to) continue;
      const below = bounded(from);
      const above = bounded(to);
      const belowLegal = below <= from;
      const aboveLegal = above >= to;
      if (belowLegal && (!aboveLegal || Math.abs(below - result) <= Math.abs(above - result))) {
        result = below;
      } else if (aboveLegal) {
        result = above;
      } else {
        result = below;
      }
    }
  }

  return result;
}

/** The draggable handles on a route, in segment order. */
export function edgeHandles(
  geometry: EdgeGeometry,
): { segmentIndex: number; point: Point; orientation: Orientation }[] {
  return geometry.segments.flatMap((segment) =>
    segment.draggable
      ? [{ segmentIndex: segment.index, point: segment.midpoint, orientation: segment.orientation }]
      : [],
  );
}
