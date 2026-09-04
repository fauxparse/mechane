// Turning a routed polyline into something drawable (#475).
//
// Everything an edge renders is defined on the *straight runs* of the route:
// the drag handles, the label anchor, and the per-segment colors. The rounded
// corners are decoration applied last, which is why ./edge-routing hands over
// an unrounded polyline and this module rounds it — an arc never carries a
// handle, a label, or a color of its own.

import { DEFAULT_MARGIN, DEFAULT_MAX_RADIUS, simplify, type Point } from "./edge-routing";

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

/**
 * The unit vector a run travels along, on one axis only.
 *
 * The tolerance is the point of it. A run built by dragging one run into line
 * with another lands a float hair off square — `a + (b - a)` is not `b` — and
 * `Math.sign` of that hair is a whole unit of direction. Corner radii are
 * shifted along this vector, so an unsquared sign puts a corner's arc on the
 * wrong axis and draws a visible kink in an otherwise straight line.
 */
function directionOf(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return {
    x: Math.abs(dx) < EPSILON ? 0 : Math.sign(dx),
    y: Math.abs(dy) < EPSILON ? 0 : Math.sign(dy),
  };
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
      position: blendPosition({
        index: i,
        count,
        midpoint: travelled + length / 2,
        first,
        interior,
      }),
      d,
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
 * One number per handle, keyed by what that handle drags.
 *
 * - `"2"` — how far run 2 has been dragged *across* itself.
 * - `"0.head"`, `"2.tail"` — how far along its run a jog cuts, measured from
 *   the stub the router would have left there. Only a run that ends at a node
 *   jogs, and a single-run route ends at one twice, so it has both.
 *
 * Indices are into the *routed* polyline, and are only ever read back against
 * a route with a matching shape signature — see `Route.signature`. An index
 * into a route of a different shape means nothing, so a shape change leaves
 * the offsets dormant rather than applying them somewhere absurd.
 */
export type HandleOffsets = Readonly<Record<string, number>>;

export type DragOptions = {
  /** Shortest a neighbouring run may be squeezed to by a drag. */
  margin?: number;
  /** See `flattenOffset`. Defaults to `DEFAULT_FLATTEN_WITHIN`. */
  flattenWithin?: number;
};

/**
 * How close to its resting line a drag has to come back before it counts as
 * no drag at all, in canvas units. Callers that know the zoom should pass a
 * screen-constant band instead; this is the fallback for the ones that don't.
 */
export const DEFAULT_FLATTEN_WITHIN = 4;

/**
 * A drag that has come back to within `within` of its resting line reads as
 * no drag: the jog it cut is dropped and the route draws flat again. Without
 * a band a jog only ever disappears at exactly zero, which a pointer never
 * lands on, so a route could never be flattened by hand once it was bent.
 *
 * Snapping is a *drawing* decision, not a commit: the raw offset keeps
 * accumulating in the drag, so carrying on through the flat shape and out the
 * far side bends the route the other way rather than sticking at zero.
 */
export function flattenOffset(delta: number, within = DEFAULT_FLATTEN_WITHIN): number {
  return Math.abs(delta) < within ? 0 : delta;
}

/** A handle on a route: what it drags, where it is drawn, which way it slides. */
export type RouteHandle = {
  /** The `HandleOffsets` key this handle writes. */
  key: string;
  /** Where the handle is drawn, in canvas coordinates. */
  point: Point;
  /** The run's own orientation. The handle slides across it. */
  orientation: Orientation;
  /**
   * The drawn segment the handle rides, for its color and for deciding which
   * handle carries the label.
   */
  drawnIndex: number;
};

export type DraggedRoute = {
  /** The polyline to draw: the routed one with the user's drags in it. */
  points: Point[];
  /** The handles, in path order. */
  handles: RouteHandle[];
};

/**
 * The route as the user has dragged it, and the handles that drag it.
 *
 * An interior run moves bodily: both its corners slide across and the runs
 * either side stretch to keep up. A run that *ends at a node* cannot do that,
 * because the node's handle is not the user's to move — so it cuts a **jog**
 * instead. A stub stays on the handle, two new runs step aside, and the rest
 * of the run travels with the drag. That is what turns an HVH route into an
 * HVHVH one, and it is the only way an edge gets around a node standing
 * between its two ends.
 *
 * A single-run route ends at a node at *both* ends, so it jogs twice: one
 * handle in the middle, H becoming HVHVH. It has to be that shape — two
 * handles on the same line joined by an HVH would need a V of zero length,
 * which ./edge-routing simplifies away as soon as it draws one.
 *
 * A jog's own run then carries a handle of its own, which slides it *along*
 * the run it cut: where the route turns is as much a decision as how far it
 * steps. So every drawn run has a handle except the stub a jog leaves at a
 * node — that one is the edge's attachment and has to stay put.
 *
 * Two things hold however the drags land, and both are pinned by tests:
 *
 *   - **Runs alternate H and V.** A run dragged flat against its neighbour is
 *     no run: it goes, and the runs either side become one. Two runs on one
 *     axis would be a corner with nothing to round.
 *   - **Every handle sits on a run that is drawn.** Room is checked before one
 *     is offered (`handleFits`, `jogFits`), and a run that a merge swallowed
 *     loses its handle until the drag that swallowed it is taken back.
 */
export function dragRoute(
  points: readonly Point[],
  offsets: HandleOffsets,
  options: DragOptions = {},
): DraggedRoute {
  const margin = options.margin ?? DEFAULT_MARGIN;
  const flattenWithin = options.flattenWithin ?? DEFAULT_FLATTEN_WITHIN;
  const count = points.length - 1;
  const moved = points.map((point) => ({ ...point }));

  const head = moved[0];
  const tail = moved[count];
  const nextToHead = points[1];
  const nextToTail = points[count - 1];
  if (count < 1 || !head || !tail || !nextToHead || !nextToTail) {
    return { points: moved, handles: [] };
  }

  // How far each run has been dragged across itself.
  const deltas = Array.from({ length: count }, () => 0);
  for (let index = 0; index < count; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const start = moved[index];
    const end = moved[index + 1];
    if (!from || !to || !start || !end) continue;
    if (!handleFits(lengthOf(from, to), index, count, margin)) continue;

    const requested = flattenOffset(offsets[`${index}`] ?? 0, flattenWithin);
    if (requested === 0) continue;

    // A vertical run is dragged horizontally, and vice versa.
    const axis = orientationOf(from, to) === "vertical" ? "x" : "y";
    const before = moved[index - 1];
    const after = moved[index + 2];
    const neighbours: Neighbour[] = [];
    // A jogged end has no neighbour to defend: the jog absorbs the whole
    // displacement and the stub it leaves behind never moves. Which is exactly
    // the ends with no neighbour in the array, so the guards say it already.
    if (before) neighbours.push({ run: before[axis] - start[axis], stub: index - 1 === 0 });
    if (after) neighbours.push({ run: after[axis] - end[axis], stub: index + 1 === count - 1 });

    const delta = clampOffset(requested, neighbours, margin, flattenWithin);
    deltas[index] = delta;
    // The corner at a node end stays where the router put it; the jog carries
    // the displacement instead.
    if (index > 0) start[axis] += delta;
    if (index < count - 1) end[axis] += delta;
  }

  const headDelta = deltas[0] ?? 0;
  const tailDelta = deltas[count - 1] ?? 0;
  const headKey = "0.head";
  const tailKey = `${count - 1}.tail`;

  const headAxis = orientationOf(head, nextToHead) === "vertical" ? "x" : "y";
  const tailAxis = orientationOf(tail, nextToTail) === "vertical" ? "x" : "y";

  // How much run each jog has to sit in, measured *along* that run only: the
  // far corner has already been dragged across, so the distance between the
  // two points is no longer the length of anything.
  const headAlong = headAxis === "y" ? "x" : "y";
  const tailAlong = tailAxis === "y" ? "x" : "y";
  const runToHead = Math.abs((moved[1]?.[headAlong] ?? head[headAlong]) - head[headAlong]);
  const runToTail = Math.abs((moved[count - 1]?.[tailAlong] ?? tail[tailAlong]) - tail[tailAlong]);
  // A jog keeps a stub at its node and a margin at the far end of its run. On
  // a single-run route the two jogs share one run, so the far one takes what
  // the near one left — and the near one leaves room for it in the first place.
  const headAt = jogDistance(
    offsets[headKey] ?? 0,
    runToHead - (count === 1 ? 3 : 1) * margin,
    margin,
    flattenWithin,
  );
  const tailAt = jogDistance(
    offsets[tailKey] ?? 0,
    (count === 1 ? runToTail - headAt : runToTail) - margin,
    margin,
    flattenWithin,
  );
  const headJog = shift(head, directionOf(head, nextToHead), headAt);
  const tailJog = shift(tail, directionOf(tail, nextToTail), tailAt);

  const raw: Point[] = [head];
  if (headDelta !== 0) raw.push(headJog, displaced(headJog, headAxis, headDelta));
  for (let index = 1; index < count; index += 1) {
    const point = moved[index];
    if (point) raw.push(point);
  }
  if (tailDelta !== 0) raw.push(displaced(tailJog, tailAxis, tailDelta), tailJog);
  raw.push(tail);

  // Two runs dragged into line with each other leave the run between them
  // dead flat, and a route is not the shape of the drags that made it: the
  // flat run goes and its neighbours become one. Which moves every run after
  // it, so where a handle ended up is looked up rather than counted.
  const drawn = simplify(raw);

  // A head jog pushes every later run two points down the raw polyline.
  const shifted = headDelta === 0 ? 0 : 2;
  const handles: RouteHandle[] = [];

  if (headDelta !== 0 && jogFits(headDelta, margin)) {
    handles.push(jogHandle(headKey, headJog, headAxis, headDelta, drawnRun(drawn.sources, 1)));
  }
  for (let index = 0; index < count; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (!from || !to) continue;
    if (!handleFits(lengthOf(from, to), index, count, margin)) continue;

    const orientation = orientationOf(from, to);
    const axis = orientation === "vertical" ? "x" : "y";
    const delta = deltas[index] ?? 0;
    // The handle rides the piece of the run left between its jogs — which is
    // the whole run where there is no jog, and is why the handle sits nearer
    // the bend than the node it leaves either way.
    const start = index === 0 ? displaced(headJog, axis, delta) : moved[index];
    const end = index === count - 1 ? displaced(tailJog, axis, delta) : moved[index + 1];
    if (!start || !end) continue;
    // A run dragged flat is not drawn at all, so there is nothing to grab.
    if (lengthOf(start, end) < EPSILON) continue;

    handles.push({
      key: `${index}`,
      point: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      orientation,
      drawnIndex: drawnRun(drawn.sources, index + shifted),
    });
  }
  if (tailDelta !== 0 && jogFits(tailDelta, margin)) {
    handles.push(
      jogHandle(tailKey, tailJog, tailAxis, tailDelta, drawnRun(drawn.sources, raw.length - 3)),
    );
  }

  // Merging can swallow a run whole — one that doubled back covers ground the
  // run before it already covered — and a handle floating off the end of the
  // line it drags is worse than no handle. Whichever run's drag caused that
  // brings this one back, which is the same recovery as a run dragged flat.
  return { points: drawn.points, handles: handles.filter((handle) => onRun(handle, drawn.points)) };
}

/** Whether a handle sits on the drawn run it claims to drag. */
function onRun(handle: RouteHandle, drawn: readonly Point[]): boolean {
  const from = drawn[handle.drawnIndex];
  const to = drawn[handle.drawnIndex + 1];
  if (!from || !to) return false;
  return (
    handle.point.x >= Math.min(from.x, to.x) - EPSILON &&
    handle.point.x <= Math.max(from.x, to.x) + EPSILON &&
    handle.point.y >= Math.min(from.y, to.y) - EPSILON &&
    handle.point.y <= Math.max(from.y, to.y) + EPSILON
  );
}

/**
 * Which drawn run a raw one ended up inside. Simplifying only ever drops
 * points, so the run starting at `rawStart` is part of the last drawn run
 * that starts no later than it.
 */
function drawnRun(sources: readonly number[], rawStart: number): number {
  let index = 0;
  for (const [drawn, source] of sources.entries()) {
    if (source > rawStart) break;
    index = drawn;
  }
  return index;
}

/**
 * How far along its run a jog cuts. The offset is measured from the stub the
 * router would have left there, so nothing dragged means the default, and a
 * jog slid to either end of what `furthest` allows still leaves a run for the
 * corners to round.
 */
function jogDistance(
  offset: number,
  furthest: number,
  margin: number,
  flattenWithin: number,
): number {
  return Math.min(Math.max(margin + flattenOffset(offset, flattenWithin), margin), furthest);
}

/**
 * A jog too short to hold a handle gets none: the chip would cover the two
 * corners either side of it, and the run it would slide is right there to
 * grab instead.
 */
function jogFits(delta: number, margin: number): boolean {
  return Math.abs(delta) >= margin * 2;
}

/** A jog's own handle, which slides the jog along the run it cut. */
function jogHandle(
  key: string,
  at: Point,
  axis: "x" | "y",
  delta: number,
  drawnIndex: number,
): RouteHandle {
  const far = displaced(at, axis, delta);
  return {
    key,
    point: { x: (at.x + far.x) / 2, y: (at.y + far.y) / 2 },
    // The jog runs across the run it cut, so it slides along it.
    orientation: axis === "y" ? "vertical" : "horizontal",
    drawnIndex,
  };
}

/**
 * Whether a run has the room to carry a handle.
 *
 * A run that ends at a node spends `margin` of itself on the stub its jog
 * leaves behind, and needs a usable length left over to ride — two more
 * margins, which is also about what the corners either side of a jog want
 * before they go square. A run that ends at a node twice pays twice. Below
 * that the handle would be a false promise: it would appear, and dragging it
 * would fold the route into something too cramped to read.
 */
function handleFits(length: number, index: number, count: number, margin: number): boolean {
  const nodeEnds = (index === 0 ? 1 : 0) + (index === count - 1 ? 1 : 0);
  if (nodeEnds === 0) return true;
  return length >= (nodeEnds + 2) * margin;
}

function displaced(point: Point, axis: "x" | "y", delta: number): Point {
  return axis === "x" ? { x: point.x + delta, y: point.y } : { x: point.x, y: point.y + delta };
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
 * direction. Any other neighbour has three legal states — a margin of length
 * left, dead flat, or turned over — so it forbids the two bands between them.
 * A drag crossing a band snaps through and the run turns over, which is how a
 * segment gets past the far end of the run beside it rather than stopping
 * short of it. A drag that lands *on* the flat point takes it: two runs
 * dragged into line with each other should become one run, not keep a
 * margin-long jink between them that flips direction as it is dragged past.
 */
function clampOffset(
  delta: number,
  neighbours: readonly Neighbour[],
  margin: number,
  flattenWithin: number,
): number {
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

  for (const { run, stub } of neighbours) {
    if (stub || Math.abs(result - run) > flattenWithin) continue;
    // Only if the flat point is reachable at all: a stub's bound outranks it.
    if (bounded(run) === run) return run;
  }

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
