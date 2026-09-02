// Where a node goes: the geometry behind reparenting and creation (#508).
//
// Containment *is* placement (#29) — a node is in a Flow because it sits in
// the Flow's box — so the two have to agree, and #508 is mostly the list of
// places where they used to disagree:
//
//   - A **Flow-owned node is always inside its Flow's box.** Anything that
//     puts one there clamps it, which is also what lets a Flow stop resizing
//     itself around wandering children: if nothing escapes, nothing has to
//     grow to catch up.
//   - A **Show-level node is never inside one.** A right-click inside a Flow
//     creating a Device — which can't nest (#26) — would otherwise leave the
//     Device sitting in a box it doesn't belong to.
//   - A **Flow's size holds still** while its children move, and re-fits only
//     when its membership changes.
//
// Everything here is pure and works on rendered React Flow nodes, so the
// rules are testable without a canvas.
import type { Position } from "@mechane/domain";

import {
  absolutePosition,
  FLOW_HEADER_HEIGHT,
  FLOW_NODE_TYPE,
  FLOW_PADDING,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "./graph/graph-to-flow";
import type { FlowDimensions, ShowFlowNode } from "./graph/graph-to-flow";

/** Vertical gap between nodes this module places in a column. */
const STACK_GAP = 32;

/** How far each ring of the free-space search steps out. */
const SEARCH_STEP = 32;

/** Rings tried before the search gives up and offsets by one step. */
const SEARCH_RINGS = 40;

/**
 * Where a create command was invoked from, which is what decides the new
 * node's home (#508): a right-click knows a point, the palette knows only
 * what is selected.
 */
export type CreationSite = { from: "point"; at: Position } | { from: "selection" };

export interface Size {
  width: number;
  height: number;
}

export interface Rectangle {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The size React Flow is drawing a node at.
 *
 * `measured` first, because it is the only entry that knows how tall a node
 * actually turned out: a Scene's height depends on its Variable and Cue rows,
 * so the projection gives it a `minHeight` and lets the DOM decide the rest
 * (../graph/graph-to-flow). Reading `style.height` alone would call every
 * Scene one header tall and clamp its top edge while its rows hung out.
 */
export function sizeOf(node: ShowFlowNode): Size {
  return {
    width: Number(node.measured?.width ?? node.style?.width ?? node.width ?? NODE_WIDTH),
    height: Number(
      node.measured?.height ??
        node.style?.height ??
        node.height ??
        node.style?.minHeight ??
        NODE_HEIGHT,
    ),
  };
}

export function rectangleAt(position: Position, size: Size): Rectangle {
  return {
    left: position.x,
    top: position.y,
    right: position.x + size.width,
    bottom: position.y + size.height,
  };
}

/** A rendered node's box in canvas coordinates, nesting resolved. */
export function nodeRectangle(
  node: ShowFlowNode,
  byId: ReadonlyMap<string, ShowFlowNode>,
): Rectangle {
  return rectangleAt(absolutePosition(node, byId), sizeOf(node));
}

export function overlaps(a: Rectangle, b: Rectangle): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function contains(rectangle: Rectangle, point: Position): boolean {
  return (
    point.x >= rectangle.left &&
    point.x <= rectangle.right &&
    point.y >= rectangle.top &&
    point.y <= rectangle.bottom
  );
}

/** Every rendered Flow, in draw order. */
export function flowsAmong(rendered: readonly ShowFlowNode[]): ShowFlowNode[] {
  return rendered.filter((node) => node.type === FLOW_NODE_TYPE);
}

/**
 * The Flow whose box covers `point`, if any — the whole of "dropped inside a
 * Flow" and "right-clicked inside a Flow". Later Flows win, so the one drawn
 * on top is the one hit.
 */
export function flowAtPoint(
  point: Position,
  rendered: readonly ShowFlowNode[],
  exclude: ReadonlySet<string> = new Set(),
): ShowFlowNode | null {
  const byId = new Map(rendered.map((node) => [node.id, node]));
  return flowsAmong(rendered)
    .filter((flow) => !exclude.has(flow.id))
    .reduce<ShowFlowNode | null>(
      (hit, flow) => (contains(nodeRectangle(flow, byId), point) ? flow : hit),
      null,
    );
}

/**
 * The area inside a Flow of this size that its children may occupy, in
 * Flow-relative coordinates.
 */
export function flowContentBox(flow: Size): Rectangle {
  return {
    left: FLOW_PADDING,
    top: FLOW_HEADER_HEIGHT + FLOW_PADDING,
    right: Math.max(FLOW_PADDING, flow.width - FLOW_PADDING),
    bottom: Math.max(FLOW_HEADER_HEIGHT + FLOW_PADDING, flow.height - FLOW_PADDING),
  };
}

/** `preferred` pulled back inside `box`, for a node of `size`. */
export function clampIntoBox(box: Rectangle, preferred: Position, size: Size): Position {
  return {
    x: clamp(preferred.x, box.left, Math.max(box.left, box.right - size.width)),
    y: clamp(preferred.y, box.top, Math.max(box.top, box.bottom - size.height)),
  };
}

/**
 * `preferred` (Flow-relative) pulled back inside `flow`'s content area, so a
 * node the director dropped half-out of its Flow lands wholly inside it.
 */
export function clampIntoFlow(flow: ShowFlowNode, preferred: Position, size: Size): Position {
  return clampIntoBox(flowContentBox(sizeOf(flow)), preferred, size);
}

/**
 * The children a Flow resized to `dimensions` would no longer contain, at the
 * positions that put them back inside — empty when the box still holds them.
 *
 * Resizing is view state, but *this* is a graph edit: the children's stored
 * positions change, so it lands as a command and undoes with the rest (#25,
 * #28). Shrinking a Flow past its contents is a legitimate thing to want —
 * the alternative, refusing to shrink, is a resize handle that stops working
 * — so the box wins and the children move to suit.
 */
export function childrenPushedInside(
  dimensions: FlowDimensions,
  children: readonly ShowFlowNode[],
): { id: string; position: Position }[] {
  const box = flowContentBox(dimensions);
  return children.reduce<{ id: string; position: Position }[]>((moves, child) => {
    const position = clampIntoBox(box, child.position, sizeOf(child));
    if (position.x !== child.position.x || position.y !== child.position.y) {
      moves.push({ id: child.id, position });
    }
    return moves;
  }, []);
}

/** `point` expressed relative to `flow`, which is where a child's position lives (#29). */
export function relativeToFlow(
  point: Position,
  flow: ShowFlowNode,
  byId: ReadonlyMap<string, ShowFlowNode>,
): Position {
  const origin = absolutePosition(flow, byId);
  return { x: point.x - origin.x, y: point.y - origin.y };
}

/**
 * Where a new child goes when the caller has no point to offer — the palette
 * creating into the selected Flow. A column below whatever is already there,
 * so it never lands on top of an existing node.
 */
export function nextChildPosition(
  flow: ShowFlowNode,
  children: readonly ShowFlowNode[],
  size: Size = { width: NODE_WIDTH, height: NODE_HEIGHT },
): Position {
  const box = flowContentBox(sizeOf(flow));
  const below = children.reduce(
    (bottom, child) => Math.max(bottom, child.position.y + sizeOf(child).height + STACK_GAP),
    box.top,
  );
  return clampIntoFlow(flow, { x: box.left, y: below }, size);
}

/**
 * `preferred` moved off any Flow it lands on. A Show-level node inside a
 * Flow's box would read as belonging to it, which containment says it does
 * not (#29) — so the two must never look alike.
 */
export function clearOfFlows(
  preferred: Position,
  size: Size,
  rendered: readonly ShowFlowNode[],
): Position {
  const byId = new Map(rendered.map((node) => [node.id, node]));
  const boxes = flowsAmong(rendered).map((flow) => nodeRectangle(flow, byId));
  return searchAnchor(preferred, (anchor) => {
    const rectangle = rectangleAt(anchor, size);
    return !boxes.some((box) => overlaps(rectangle, box));
  });
}

/** Finds one compact, non-overlapping top-level layout for moved nodes. */
export function moveOutPositions(nodeIds: string[], rendered: ShowFlowNode[]): Position[] {
  const nodeIdSet = new Set(nodeIds);
  const renderedById = new Map(rendered.map((node) => [node.id, node]));
  const orderedSelected: ShowFlowNode[] = [];
  for (const nodeId of nodeIds) {
    const node = renderedById.get(nodeId);
    if (node) orderedSelected.push(node);
  }
  if (orderedSelected.length === 0) return nodeIds.map(() => ({ x: 0, y: 0 }));

  const origin = {
    x: Math.min(...orderedSelected.map((node) => absolutePosition(node, renderedById).x)),
    y: Math.min(...orderedSelected.map((node) => absolutePosition(node, renderedById).y)),
  };
  const obstacles = rendered.reduce<Rectangle[]>((result, node) => {
    if (!nodeIdSet.has(node.id)) result.push(nodeRectangle(node, renderedById));
    return result;
  }, []);
  const sizes = orderedSelected.map(sizeOf);

  // Each node keeps its own size, so the column carries the pair rather than
  // two arrays a later reader has to keep in step by index.
  const layoutAt = (anchor: Position): { position: Position; size: Size }[] => {
    let y = anchor.y;
    return sizes.map((size) => {
      const position = { x: anchor.x, y };
      y += size.height + STACK_GAP;
      return { position, size };
    });
  };
  const isFree = (anchor: Position) =>
    layoutAt(anchor).every(
      ({ position, size }) =>
        !obstacles.some((obstacle) => overlaps(rectangleAt(position, size), obstacle)),
    );

  return layoutAt(searchAnchor(origin, isFree)).map(({ position }) => position);
}

/**
 * The size each Flow should be drawn at, given the last set of sizes and the
 * children it has now.
 *
 * A Flow re-fits when its *membership* changes and at no other time: growing
 * it to chase a child being dragged around inside it makes the box jitter
 * under the pointer, and shrinking it when the child comes back is worse
 * (#508). Positions are therefore deliberately not an input — the child set
 * is, and `clampIntoFlow` is what keeps the children inside the result.
 *
 * Returns `current` unchanged when nothing needs re-fitting, so a caller can
 * hand this straight to `setState` without looping.
 */
export interface FittedFlow {
  /** What this size was fitted to — see `keyOf`. */
  childKey: string;
  dimensions: FlowDimensions;
}

/**
 * What a Flow re-fits for: which children it has, and how big each one is.
 *
 * Pointedly *not* where they are. A position change is a child being dragged
 * around inside the box, and having the box follow it is the thing #508
 * removed. A size change is the DOM measuring a Scene taller than the
 * projection estimated, which the box does have to catch up with, or a Scene
 * with Cue rows hangs out the bottom.
 */
function keyOf(children: readonly ShowFlowNode[]): string {
  return children
    .map((child) => {
      const { width, height } = sizeOf(child);
      return `${child.id}:${width}x${height}`;
    })
    .join(" ");
}

export function fitFlows(
  rendered: readonly ShowFlowNode[],
  current: ReadonlyMap<string, FittedFlow>,
): Map<string, FittedFlow> {
  const childrenByFlow = new Map<string, ShowFlowNode[]>();
  for (const node of rendered) {
    if (!node.parentId) continue;
    const siblings = childrenByFlow.get(node.parentId);
    if (siblings) siblings.push(node);
    else childrenByFlow.set(node.parentId, [node]);
  }
  const flows = flowsAmong(rendered);

  let changed = current.size !== flows.length;
  const next = new Map<string, FittedFlow>();
  for (const flow of flows) {
    const children = childrenByFlow.get(flow.id) ?? [];
    const childKey = keyOf(children);
    const existing = current.get(flow.id);
    if (existing && existing.childKey === childKey) {
      next.set(flow.id, existing);
      continue;
    }
    changed = true;
    next.set(flow.id, { childKey, dimensions: fitAround(children) });
  }
  return changed ? next : (current as Map<string, FittedFlow>);
}

/**
 * The smallest box holding `children`, measured rather than estimated. The
 * projection's `flowSize` guesses a Scene's height from its row count before
 * anything is rendered; once the DOM has an answer, this is the one to use —
 * a Cue row is a good deal taller than the estimate allows for.
 */
function fitAround(children: readonly ShowFlowNode[]): FlowDimensions {
  const right = children.reduce(
    (edge, child) => Math.max(edge, child.position.x + sizeOf(child).width),
    0,
  );
  const bottom = children.reduce(
    (edge, child) => Math.max(edge, child.position.y + sizeOf(child).height),
    0,
  );
  return {
    width: Math.max(NODE_WIDTH, right) + FLOW_PADDING,
    height: Math.max(FLOW_HEADER_HEIGHT + NODE_HEIGHT, bottom) + FLOW_PADDING,
  };
}

/**
 * The size each Flow is drawn at: what the director dragged it to, or the fit
 * around its children until they do.
 *
 * A manual size wins outright, shrinking included. Flooring it at the fit
 * seems safer — the children would always be inside — but the fit tracks the
 * children's own extents, so it sits right against the box and pins every
 * inward drag: the resize handle stops working. Keeping the children inside
 * is `clampIntoFlow`'s job at the two moments a child can move, which leaves
 * the handle free to do exactly what it looks like it does.
 */
export function effectiveFlowDimensions(
  fitted: ReadonlyMap<string, FittedFlow>,
  manual: ReadonlyMap<string, FlowDimensions>,
): Map<string, FlowDimensions> {
  const dimensions = new Map<string, FlowDimensions>();
  for (const [flowId, flow] of fitted) dimensions.set(flowId, flow.dimensions);
  for (const [flowId, size] of manual) dimensions.set(flowId, size);
  return dimensions;
}

/** The first anchor at or spiralling out from `origin` where `isFree` holds. */
function searchAnchor(origin: Position, isFree: (anchor: Position) => boolean): Position {
  for (let ring = 0; ring <= SEARCH_RINGS; ring += 1) {
    const distance = ring * SEARCH_STEP;
    const candidates =
      ring === 0
        ? [origin]
        : [
            { x: origin.x + distance, y: origin.y },
            { x: origin.x - distance, y: origin.y },
            { x: origin.x, y: origin.y + distance },
            { x: origin.x, y: origin.y - distance },
          ];
    const found = candidates.find(isFree);
    if (found) return found;
  }
  return { x: origin.x + SEARCH_STEP, y: origin.y + SEARCH_STEP };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
