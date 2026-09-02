// Orthogonal smooth-step routing for Show edges (#475).
//
// Pure geometry: absolute canvas coordinates in, an unrounded polyline out.
// Nothing here knows about React Flow, Flows, containment, or rendering — the
// edge component adapts, and ./edge-path turns the polyline into drawable
// paths. Keeping the two apart is what makes the nasty layouts testable
// without a canvas.
//
// Every route is a sequence of axis-aligned segments alternating between
// horizontal and vertical. The route leaves each endpoint perpendicular to
// its handle's side, and clears both endpoint boxes by `margin` wherever it
// can — see `effectiveMargin` for what happens when it can't.

/** A point in absolute canvas coordinates. */
export type Point = { x: number; y: number };

/** An axis-aligned box in absolute canvas coordinates. */
export type Rect = { x: number; y: number; width: number; height: number };

/**
 * The side of a node a handle sits on. Deliberately not React Flow's
 * `Position`: the router is vendor-free, and the component maps between them.
 */
export type Side = "right" | "bottom" | "left" | "top";

/** One end of an edge: where it attaches, which way it faces, and its node. */
export type Endpoint = {
  point: Point;
  side: Side;
  rect: Rect;
};

/**
 * Which way a route detours when it has to double back. Named for the
 * perpendicular axis rather than "above"/"below", because the axis depends on
 * the handle sides: a route between two horizontal handles detours vertically,
 * one between two vertical handles detours horizontally.
 */
export type DetourSide = "negative" | "positive";

export type RouteOptions = {
  /** Clearance from each endpoint box, and the length of each exit stub. */
  margin?: number;
  /** Largest corner radius, carried through so callers configure one thing. */
  maxRadius?: number;
  /**
   * Boxes the route should avoid. Obstacles may only nudge a detour line
   * sideways — never add a bend. The moment avoidance wants a new bend it has
   * become pathfinding, which is the thing this router exists to replace.
   */
  obstacles?: readonly Rect[];
  /**
   * Perpendicular displacement applied to the middle of the route, so edges
   * sharing both handles can be told apart. Parallel Navigate edges are
   * allowed (#20) and route identically, which without this puts them exactly
   * on top of one another — handles included, so they cannot even be grabbed
   * and separated by hand.
   */
  fan?: number;
  /**
   * The detour side this edge chose last time. A route that flips sides
   * mid-drag both looks like a glitch and changes its shape signature, which
   * silently drops the user's handle offsets — so the flip needs hysteresis.
   */
  previousDetour?: DetourSide | null;
};

export type Route = {
  /** The unrounded polyline, source point first, target point last. */
  points: Point[];
  /** The detour side taken, or null when the route didn't need one. */
  detour: DetourSide | null;
  /**
   * The route's shape, e.g. `"HVH"`. Handle offsets are keyed by this rather
   * than by segment index: an index means nothing once a re-route changes the
   * segment count, but a signature match means the offsets still apply.
   */
  signature: string;
};

export const DEFAULT_MARGIN = 12;

export const DEFAULT_MAX_RADIUS = 8;

/** Lengths below this are treated as zero, so float noise can't add segments. */
const EPSILON = 0.01;

const SIDE_ORDER: readonly Side[] = ["right", "bottom", "left", "top"];

/**
 * Quarter-turns, in the order `SIDE_ORDER` names. Rotating by one turn maps
 * right → bottom → left → top → right, which is clockwise on screen because
 * y grows downwards.
 */
function rotate(point: Point, turns: number): Point {
  switch (((turns % 4) + 4) % 4) {
    case 1:
      return { x: -point.y, y: point.x };
    case 2:
      return { x: -point.x, y: -point.y };
    case 3:
      return { x: point.y, y: -point.x };
    default:
      return point;
  }
}

function rotateRect(rect: Rect, turns: number): Rect {
  const a = rotate({ x: rect.x, y: rect.y }, turns);
  const b = rotate({ x: rect.x + rect.width, y: rect.y + rect.height }, turns);
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

function rotateEndpoint(endpoint: Endpoint, turns: number, side: Side): Endpoint {
  return { point: rotate(endpoint.point, turns), side, rect: rotateRect(endpoint.rect, turns) };
}

function sideIndex(side: Side): number {
  return SIDE_ORDER.indexOf(side);
}

function shiftSide(side: Side, turns: number): Side {
  const shifted = SIDE_ORDER[(sideIndex(side) + turns + 4) % 4];
  // SIDE_ORDER has four entries and the index is taken modulo four.
  if (!shifted) throw new Error(`unreachable side rotation: ${side} by ${turns}`);
  return shifted;
}

/** Drops repeated points and merges runs that carry straight on. */
function simplify(points: readonly Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    const last = kept[kept.length - 1];
    if (last && Math.abs(last.x - point.x) < EPSILON && Math.abs(last.y - point.y) < EPSILON) {
      continue;
    }
    const previous = kept[kept.length - 2];
    if (last && previous) {
      const wasHorizontal = Math.abs(previous.y - last.y) < EPSILON;
      const isHorizontal = Math.abs(last.y - point.y) < EPSILON;
      const wentForward = wasHorizontal ? last.x > previous.x : last.y > previous.y;
      const goesForward = isHorizontal ? point.x > last.x : point.y > last.y;
      // Same axis *and* same direction is one run split in two. Same axis in
      // opposite directions is a genuine reversal — a route doubling back on
      // itself, which two same-side handles on the same row force — and
      // merging those two segments would erase the return leg entirely.
      if (wasHorizontal === isHorizontal && wentForward === goesForward) {
        kept[kept.length - 1] = point;
        continue;
      }
    }
    kept.push(point);
  }
  return kept;
}

/**
 * The stub length actually used. Two nodes closer together than `2 * margin`
 * cannot give both ends a full-length stub *and* keep the clearance between
 * them, so both squeeze proportionally: half the gap each. Giving up and
 * drawing a straight line — what most routers do here — changes the visual
 * language exactly when the layout is tightest, which reads as a bug.
 */
function effectiveMargin(gap: number, margin: number): number {
  if (gap >= margin * 2) return margin;
  // A gap of zero or less means the boxes overlap along this axis, so the
  // route is detouring around them rather than threading between them. The
  // stubs are not what's contended there, and full margin still applies.
  if (gap <= 0) return margin;
  return gap / 2;
}

/**
 * Slides a line at `position` (on the axis perpendicular to its run) clear of
 * any obstacle it crosses, staying within `[lower, upper]`. The line spans
 * `[from, to]` along its own axis.
 */
function nudgeClear(
  position: number,
  from: number,
  to: number,
  obstacles: readonly Rect[],
  bounds: { lower: number; upper: number },
  margin: number,
  axis: "x" | "y",
): number {
  const spanLow = Math.min(from, to);
  const spanHigh = Math.max(from, to);
  let result = position;

  for (const obstacle of obstacles) {
    const acrossLow = axis === "x" ? obstacle.x : obstacle.y;
    const acrossHigh = acrossLow + (axis === "x" ? obstacle.width : obstacle.height);
    const alongLow = axis === "x" ? obstacle.y : obstacle.x;
    const alongHigh = alongLow + (axis === "x" ? obstacle.height : obstacle.width);

    const crossesAlong = spanHigh > alongLow && spanLow < alongHigh;
    const crossesAcross = result > acrossLow - margin && result < acrossHigh + margin;
    if (!crossesAlong || !crossesAcross) continue;

    const before = acrossLow - margin;
    const after = acrossHigh + margin;
    const candidates = [before, after].filter((c) => c >= bounds.lower && c <= bounds.upper);
    if (candidates.length === 0) continue;
    result = candidates.reduce((best, c) =>
      Math.abs(c - result) < Math.abs(best - result) ? c : best,
    );
  }

  return result;
}

type Solved = { points: Point[]; detour: DetourSide | null };

/**
 * Solves the route in a frame where the source handle always faces right, so
 * there are four cases rather than sixteen. `relative` is the target's side
 * after the same rotation: 0 right, 1 bottom, 2 left, 3 top.
 */
function solveFacingRight(
  source: Endpoint,
  target: Endpoint,
  relative: number,
  options: Required<Pick<RouteOptions, "margin" | "obstacles" | "previousDetour">>,
): Solved {
  const { margin, obstacles, previousDetour } = options;

  const sourceRight = source.rect.x + source.rect.width;
  const gap = relative === 2 ? target.rect.x - sourceRight : Number.POSITIVE_INFINITY;
  const m = effectiveMargin(gap, margin);

  const s: Point = { x: source.point.x + m, y: source.point.y };
  const t = exitPoint(target.point, relative, m);

  const detour = detourSide(s, t, m, previousDetour);

  if (relative === 2) {
    const needsDetour = t.x - s.x < -EPSILON;
    return {
      points: opposing(s, t, source, target, m, obstacles, detour),
      detour: needsDetour ? detour : null,
    };
  }
  if (relative === 0) {
    const same = sameDirection(s, t, source, target, m, obstacles, detour);
    return { points: same.points, detour: same.detoured ? detour : null };
  }
  return { points: perpendicular(s, t, relative === 1 ? 1 : -1, m), detour: null };
}

/** Where the target's stub starts, given the target's side in the rotated frame. */
function exitPoint(point: Point, relative: number, margin: number): Point {
  switch (relative) {
    case 0:
      return { x: point.x + margin, y: point.y };
    case 1:
      return { x: point.x, y: point.y + margin };
    case 2:
      return { x: point.x - margin, y: point.y };
    default:
      return { x: point.x, y: point.y - margin };
  }
}

/** Both handles face each other along the same axis: the classic smooth step. */
function opposing(
  s: Point,
  t: Point,
  source: Endpoint,
  target: Endpoint,
  margin: number,
  obstacles: readonly Rect[],
  detour: DetourSide,
): Point[] {
  if (t.x - s.x >= -EPSILON) {
    const midpoint = (s.x + t.x) / 2;
    const x = nudgeClear(midpoint, s.y, t.y, obstacles, { lower: s.x, upper: t.x }, margin, "x");
    return [s, { x, y: s.y }, { x, y: t.y }, t];
  }

  const y = nudgeClear(
    detourPosition(detour, source, target, margin),
    s.x,
    t.x,
    obstacles,
    { lower: Number.NEGATIVE_INFINITY, upper: Number.POSITIVE_INFINITY },
    margin,
    "y",
  );
  return [s, { x: s.x, y }, { x: t.x, y }, t];
}

/** The y a detour runs along, clear of both endpoint boxes. */
function detourPosition(
  side: DetourSide,
  source: Endpoint,
  target: Endpoint,
  margin: number,
): number {
  return side === "negative"
    ? Math.min(source.rect.y, target.rect.y) - margin
    : Math.max(source.rect.y + source.rect.height, target.rect.y + target.rect.height) + margin;
}

/**
 * Which way a route goes when it has to double back.
 *
 * Both ways are the *same length* — an orthogonal detour above costs exactly
 * what one below costs, for any pair of boxes — so there is no cost function
 * to minimise here and pretending otherwise just produces coin flips. The rule
 * is instead the one a person would draw: sweep towards the side the target is
 * already on, rather than away from it and back.
 *
 * The flip needs hysteresis. Without it, dragging a node through the tie point
 * snaps the edge across the canvas, and — worse — changes its shape signature,
 * silently dropping whatever handle offsets the user had placed on it.
 */
function detourSide(
  s: Point,
  t: Point,
  margin: number,
  previousDetour: DetourSide | null,
): DetourSide {
  const preferred: DetourSide = t.y - s.y >= 0 ? "positive" : "negative";
  if (!previousDetour || previousDetour === preferred) return preferred;
  return Math.abs(t.y - s.y) > margin ? preferred : previousDetour;
}

/**
 * Both handles face the same way, so the route runs out past the further one
 * and doubles back. When either of its two straight runs would cut through the
 * *other* node — which is what happens whenever the boxes share rows — it goes
 * around instead, on the same detour side the opposing case would pick.
 */
function sameDirection(
  s: Point,
  t: Point,
  source: Endpoint,
  target: Endpoint,
  margin: number,
  obstacles: readonly Rect[],
  detour: DetourSide,
): { points: Point[]; detoured: boolean } {
  const beyond = Math.max(s.x, t.x);
  const x = nudgeClear(
    beyond,
    s.y,
    t.y,
    obstacles,
    { lower: beyond, upper: Number.POSITIVE_INFINITY },
    margin,
    "x",
  );
  const cutsThrough =
    crossesRect(s, { x, y: s.y }, target.rect) || crossesRect({ x, y: t.y }, t, source.rect);
  if (!cutsThrough) {
    return { points: [s, { x, y: s.y }, { x, y: t.y }, t], detoured: false };
  }

  const y = detourPosition(detour, source, target, margin);
  return { points: [s, { x: s.x, y }, { x: t.x, y }, t], detoured: true };
}

/** Whether the axis-aligned run from `a` to `b` passes through `rect`. */
function crossesRect(a: Point, b: Point, rect: Rect): boolean {
  return (
    Math.max(a.x, b.x) > rect.x + EPSILON &&
    Math.min(a.x, b.x) < rect.x + rect.width - EPSILON &&
    Math.max(a.y, b.y) > rect.y + EPSILON &&
    Math.min(a.y, b.y) < rect.y + rect.height - EPSILON
  );
}

/**
 * The handles are at right angles. `towards` is +1 when the target faces down
 * (so the route arrives travelling up, from below) and -1 when it faces up.
 */
function perpendicular(s: Point, t: Point, towards: 1 | -1, margin: number): Point[] {
  const arrivesFromBeyond = towards * (t.y - s.y) <= EPSILON;
  const aheadInX = t.x - s.x >= -EPSILON;

  if (aheadInX && arrivesFromBeyond) return [s, { x: t.x, y: s.y }, t];
  if (arrivesFromBeyond) {
    const y = (s.y + t.y) / 2;
    return [s, { x: s.x, y }, { x: t.x, y }, t];
  }
  const y = t.y + towards * margin;
  return [s, { x: s.x, y }, { x: t.x, y }, t];
}

/**
 * Steps the middle of a route aside, so that two routes between the same pair
 * of handles are visibly two routes.
 *
 * With a run in the middle to move, this is exactly what dragging that run's
 * handle does — which is the point: the fan is the route's *default* position,
 * and any nudge the author has saved then applies on top of it. With no
 * middle run to move, the route has to grow one: a straight line or a single
 * corner has nowhere to put a second edge, so a jog is cut into its longest
 * run, leaving a margin-length stub at each end of that run.
 */
function fanRoute(points: readonly Point[], fan: number, margin: number): Point[] {
  if (fan === 0 || points.length < 2) return [...points];
  const count = points.length - 1;

  if (count >= 3) {
    const index = Math.floor((count - 1) / 2);
    return points.map((point, at) =>
      at === index || at === index + 1
        ? displace(point, points[index], points[index + 1], fan)
        : point,
    );
  }

  const index = longestRun(points);
  const from = points[index];
  const to = points[index + 1];
  if (!from || !to) return [...points];

  const horizontal = Math.abs(from.y - to.y) < EPSILON;
  const along = horizontal ? "x" : "y";
  const across = horizontal ? "y" : "x";
  const step = Math.sign(to[along] - from[along]) * margin;
  // Too short to hold two stubs and a step between them: leave it be and let
  // the edges overlap rather than draw a jog with no room for its corners.
  if (Math.abs(to[along] - from[along]) < margin * 4) return [...points];

  const first = { ...from, [along]: from[along] + step };
  const last = { ...to, [along]: to[along] - step };
  return [
    ...points.slice(0, index + 1),
    first,
    { ...first, [across]: first[across] + fan },
    { ...last, [across]: last[across] + fan },
    last,
    ...points.slice(index + 1),
  ];
}

/** Moves a point perpendicular to the run from `from` to `to`. */
function displace(point: Point, from: Point | undefined, to: Point | undefined, by: number): Point {
  if (!from || !to) return point;
  return Math.abs(from.y - to.y) < EPSILON
    ? { x: point.x, y: point.y + by }
    : { x: point.x + by, y: point.y };
}

function longestRun(points: readonly Point[]): number {
  let best = 0;
  let bestLength = -1;
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    if (!from || !to) continue;
    const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
    if (length > bestLength) {
      bestLength = length;
      best = i;
    }
  }
  return best;
}

/** `"HVH"`, `"HVHVH"`, and so on — see `Route.signature`. */
export function routeSignature(points: readonly Point[]): string {
  let signature = "";
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    if (!from || !to) continue;
    signature += Math.abs(from.y - to.y) < EPSILON ? "H" : "V";
  }
  return signature;
}

/**
 * Routes an orthogonal smooth-step path between two handles.
 *
 * The result is *unrounded*: corner radii are applied at draw time by
 * ./edge-path, because handles, the label anchor and per-segment colors are
 * all defined on the straight runs and the arcs are decoration.
 */
export function routeSmoothStep(
  source: Endpoint,
  target: Endpoint,
  options: RouteOptions = {},
): Route {
  const margin = options.margin ?? DEFAULT_MARGIN;
  const obstacles = options.obstacles ?? [];
  const previousDetour = options.previousDetour ?? null;

  const turns = (4 - sideIndex(source.side)) % 4;
  const rotatedSource = rotateEndpoint(source, turns, "right");
  const rotatedTarget = rotateEndpoint(target, turns, shiftSide(target.side, turns));
  const relative = sideIndex(rotatedTarget.side);

  const solved = solveFacingRight(rotatedSource, rotatedTarget, relative, {
    margin,
    obstacles: obstacles.map((rect) => rotateRect(rect, turns)),
    previousDetour,
  });

  const routed = simplify([rotatedSource.point, ...solved.points, rotatedTarget.point]);
  const points = simplify(fanRoute(routed, options.fan ?? 0, margin)).map((point) =>
    rotate(point, -turns),
  );

  return { points, detour: solved.detour, signature: routeSignature(points) };
}
