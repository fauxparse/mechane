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
import type { FlowSize, GraphEdge, Position } from "@mechane/domain";

import type { FlowDimensions, ShowFlowNode } from "./graph/graph-to-flow";
import {
  absolutePosition,
  FLOW_HEADER_HEIGHT,
  FLOW_NODE_TYPE,
  FLOW_PADDING,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "./graph/graph-to-flow";

/** Vertical gap between nodes this module places in a column. */
const STACK_GAP = 32;

/** Gap used by the explicit tidy command between nodes and graph regions. */
const TIDY_GAP = 96;

/** Breathing room inside a Flow laid out by tidy. */
const TIDY_FLOW_PADDING = 64;

/** The first child row below a Flow header in a tidy layout. */
const TIDY_FLOW_CONTENT_TOP = FLOW_HEADER_HEIGHT + TIDY_FLOW_PADDING;

/** Horizontal gap between the two Scenes in a compact navigation pair. */
export const SCENE_NAVIGATION_GAP = 32;

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

export interface TidyLayout {
  positions: { id: string; position: Position }[];
  flowSizes: { id: string; size: FlowSize }[];
}

function orderedTidyNodes(nodes: readonly ShowFlowNode[]): ShowFlowNode[] {
  return [...nodes].sort(
    (left, right) =>
      left.position.y - right.position.y ||
      left.position.x - right.position.x ||
      left.id.localeCompare(right.id),
  );
}

/**
 * Follows the authored Scene navigation order when a Flow has an entry Scene.
 * A cycle is intentional in a Flow, so the walk stops at its first repeated
 * Scene and appends any branches in their existing order.
 */
function orderedFlowScenes(
  flow: ShowFlowNode,
  scenes: readonly ShowFlowNode[],
  edges: readonly GraphEdge[],
): ShowFlowNode[] {
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const nextById = new Map<string, string>();
  for (const edge of edges) {
    if (edge.kind !== "navigate" || !byId.has(edge.sourceId) || !byId.has(edge.targetId)) continue;
    if (!nextById.has(edge.sourceId)) nextById.set(edge.sourceId, edge.targetId);
  }

  const ordered: ShowFlowNode[] = [];
  const seen = new Set<string>();
  let current = flow.data.kind === "flow" ? flow.data.defaultSceneId : null;
  while (current && !seen.has(current)) {
    const scene = byId.get(current);
    if (!scene) break;
    seen.add(current);
    ordered.push(scene);
    current = nextById.get(current) ?? null;
  }

  if (ordered.length === 0) {
    const incoming = new Map(scenes.map((scene) => [scene.id, 0]));
    for (const targetId of nextById.values()) {
      incoming.set(targetId, (incoming.get(targetId) ?? 0) + 1);
    }
    const queue = orderedTidyNodes(scenes).filter((scene) => incoming.get(scene.id) === 0);
    while (queue.length > 0) {
      const scene = queue.shift();
      if (!scene) break;
      ordered.push(scene);
      const next = nextById.get(scene.id);
      if (next) {
        const remaining = (incoming.get(next) ?? 0) - 1;
        incoming.set(next, remaining);
        if (remaining === 0) {
          const nextScene = byId.get(next);
          if (nextScene) queue.push(nextScene);
        }
      }
    }
  }

  for (const scene of orderedTidyNodes(scenes)) {
    if (!seen.has(scene.id) && !ordered.some((candidate) => candidate.id === scene.id)) {
      ordered.push(scene);
    }
  }
  return ordered;
}

function tidyFlowSize(children: readonly ShowFlowNode[]): FlowSize {
  const right = children.reduce(
    (edge, child) => Math.max(edge, child.position.x + sizeOf(child).width),
    0,
  );
  const bottom = children.reduce(
    (edge, child) => Math.max(edge, child.position.y + sizeOf(child).height),
    0,
  );
  return {
    width: Math.max(NODE_WIDTH, right) + TIDY_FLOW_PADDING,
    height: Math.max(FLOW_HEADER_HEIGHT + NODE_HEIGHT, bottom) + TIDY_FLOW_PADDING,
  };
}

function sourcePosition(
  nodeId: string,
  nodes: ReadonlyMap<string, ShowFlowNode>,
  positions: ReadonlyMap<string, Position>,
): Position | null {
  const node = nodes.get(nodeId);
  const position = positions.get(nodeId);
  if (!node || !position) return null;
  if (!node.parentId) return position;
  const parent = positions.get(node.parentId);
  return parent ? { x: parent.x + position.x, y: parent.y + position.y } : position;
}

/**
 * Lays out the visible graph for the explicit Tidy command.
 *
 * Scenes follow their Flow's navigation order from left to right. Other Flow
 * children sit in a roomy row below them, aligned with their first Scene
 * target. Root Flows occupy a vertical lane, non-Flow authoring nodes sit to
 * their left, and Devices occupy a final lane to the right of every other
 * node. This keeps the common producer → Flow → Device direction legible
 * without pretending that arbitrary graph routing is a full path-finding
 * problem.
 */
export function tidyLayout(
  rendered: readonly ShowFlowNode[],
  edges: readonly GraphEdge[] = [],
): TidyLayout {
  const byId = new Map(rendered.map((node) => [node.id, node]));
  const childrenByParent = new Map<string | null, ShowFlowNode[]>();
  for (const node of rendered) {
    const parentId = node.parentId ?? null;
    const children = childrenByParent.get(parentId);
    if (children) children.push(node);
    else childrenByParent.set(parentId, [node]);
  }

  const positions: { id: string; position: Position }[] = [];
  const positionById = new Map<string, Position>();
  const flowSizes: { id: string; size: FlowSize }[] = [];
  const flowSizesById = new Map<string, FlowSize>();
  const place = (node: ShowFlowNode, position: Position) => {
    positions.push({ id: node.id, position });
    positionById.set(node.id, position);
  };

  const flows = rendered.filter((node) => node.type === FLOW_NODE_TYPE);
  for (const flow of flows) {
    const children = childrenByParent.get(flow.id) ?? [];
    const scenes = orderedFlowScenes(
      flow,
      children.filter((node) => node.data.kind === "scene"),
      edges,
    );
    const others = orderedTidyNodes(children.filter((node) => node.data.kind !== "scene"));
    const plannedChildren: ShowFlowNode[] = [];
    let x = TIDY_FLOW_PADDING;
    let sceneBottom = TIDY_FLOW_CONTENT_TOP;
    const sceneColumnById = new Map<string, Position>();

    for (const scene of scenes) {
      const position = { x, y: TIDY_FLOW_CONTENT_TOP };
      place(scene, position);
      plannedChildren.push({ ...scene, position });
      sceneColumnById.set(scene.id, position);
      sceneBottom = Math.max(sceneBottom, position.y + sizeOf(scene).height);
      x += sizeOf(scene).width + TIDY_GAP;
    }

    const otherY = scenes.length > 0 ? sceneBottom + TIDY_GAP : TIDY_FLOW_CONTENT_TOP;
    let nextOtherX = TIDY_FLOW_PADDING;
    for (const child of others) {
      const target = edges.find(
        (edge) => edge.sourceId === child.id && sceneColumnById.has(edge.targetId),
      );
      const targetPosition = target ? sceneColumnById.get(target.targetId) : undefined;
      const position = {
        x: Math.max(targetPosition?.x ?? nextOtherX, nextOtherX),
        y: otherY,
      };
      place(child, position);
      plannedChildren.push({ ...child, position });
      nextOtherX = position.x + sizeOf(child).width + TIDY_GAP;
    }

    const size = tidyFlowSize(plannedChildren);
    flowSizesById.set(flow.id, size);
    flowSizes.push({ id: flow.id, size });
  }

  const roots = orderedTidyNodes(childrenByParent.get(null) ?? []);
  const leftNodes = roots.filter(
    (node) => node.data.kind !== "flow" && node.data.kind !== "device",
  );
  const rootFlows = roots.filter((node) => node.data.kind === "flow");
  const devices = roots.filter((node) => node.data.kind === "device");
  const baseX = roots.length > 0 ? Math.min(...roots.map((node) => node.position.x)) : 0;
  const baseY = roots.length > 0 ? Math.min(...roots.map((node) => node.position.y)) : 0;
  const leftWidth =
    leftNodes.length > 0 ? Math.max(...leftNodes.map((node) => sizeOf(node).width)) + TIDY_GAP : 0;
  const flowX = baseX + leftWidth;

  let flowY = baseY;
  for (const flow of rootFlows) {
    place(flow, { x: flowX, y: flowY });
    flowY += (flowSizesById.get(flow.id)?.height ?? sizeOf(flow).height) + TIDY_GAP;
  }

  let leftY = baseY;
  for (const node of leftNodes) {
    place(node, { x: baseX, y: leftY });
    leftY += sizeOf(node).height + TIDY_GAP;
  }

  const nonDeviceRoots = roots.filter((node) => node.data.kind !== "device");
  const graphRight =
    nonDeviceRoots.length > 0
      ? Math.max(
          ...nonDeviceRoots.map(
            (node) =>
              (positionById.get(node.id)?.x ?? node.position.x) +
              (flowSizesById.get(node.id)?.width ?? sizeOf(node).width),
          ),
        )
      : baseX + NODE_WIDTH;
  const deviceX = graphRight + TIDY_GAP;
  const devicePlans = devices.map((device) => {
    const edge = edges.find(
      (candidate) => candidate.kind === "device" && candidate.targetId === device.id,
    );
    const sourceNode = edge ? byId.get(edge.sourceId) : undefined;
    const source = edge ? sourcePosition(edge.sourceId, byId, positionById) : null;
    return {
      device,
      desiredY:
        source && sourceNode
          ? source.y + sizeOf(sourceNode).height / 2 - sizeOf(device).height / 2
          : baseY,
    };
  });
  devicePlans.sort(
    (left, right) =>
      left.desiredY - right.desiredY || left.device.id.localeCompare(right.device.id),
  );
  let deviceY = baseY;
  for (const { device, desiredY } of devicePlans) {
    const position = { x: deviceX, y: Math.max(deviceY, desiredY) };
    place(device, position);
    deviceY = position.y + sizeOf(device).height + TIDY_GAP;
  }

  return { positions, flowSizes };
}

/**
 * The explicit Flow size required to contain rendered children.
 *
 * Callers use this while planning a create or resize command. It is never
 * consulted by graph projection, so membership and measured child dimensions
 * cannot resize an existing Flow behind the director's back.
 */
export function flowDimensionsForChildren(children: readonly ShowFlowNode[]): FlowDimensions {
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

export interface CompactScenePair {
  flowPosition: Position;
  sourcePosition: Position;
  destinationPosition: Position;
  dimensions: FlowDimensions;
}

/**
 * Places two root-level Scenes side by side in a new Flow.
 *
 * `intent` is either the original drag midpoint or the empty-drop point.
 * Every rendered node and Flow except the pair is an obstacle; the search
 * therefore moves only the new Flow and never unrelated content.
 */
export function compactRootScenePair(
  source: ShowFlowNode,
  destination: ShowFlowNode,
  intent: Position,
  rendered: readonly ShowFlowNode[],
): CompactScenePair {
  return compactPair(
    sizeOf(source),
    sizeOf(destination),
    intent,
    rendered,
    source.id,
    destination.id,
    false,
  );
}

/** The same layout for a newly-created destination whose top-left is the drop. */
export function compactRootSceneAtDrop(
  source: ShowFlowNode,
  drop: Position,
  rendered: readonly ShowFlowNode[],
): CompactScenePair {
  return compactPair(
    sizeOf(source),
    { width: NODE_WIDTH, height: NODE_HEIGHT },
    drop,
    rendered,
    source.id,
    null,
    true,
  );
}

function compactPair(
  sourceSize: Size,
  destinationSize: Size,
  intent: Position,
  rendered: readonly ShowFlowNode[],
  sourceId: string,
  destinationId: string | null,
  destinationAtIntent: boolean,
): CompactScenePair {
  const sourcePosition = {
    x: FLOW_PADDING,
    y: FLOW_HEADER_HEIGHT + FLOW_PADDING,
  };
  const destinationPosition = {
    x: FLOW_PADDING + sourceSize.width + SCENE_NAVIGATION_GAP,
    y: sourcePosition.y,
  };
  const dimensions = {
    width: Math.max(NODE_WIDTH, destinationPosition.x + destinationSize.width) + FLOW_PADDING,
    height:
      Math.max(
        FLOW_HEADER_HEIGHT + NODE_HEIGHT,
        Math.max(
          sourcePosition.y + sourceSize.height,
          destinationPosition.y + destinationSize.height,
        ),
      ) + FLOW_PADDING,
  };
  const byId = new Map(rendered.map((node) => [node.id, node]));
  const obstacles = rendered.reduce<Rectangle[]>((result, node) => {
    if (node.id !== sourceId && node.id !== destinationId) {
      result.push(nodeRectangle(node, byId));
    }
    return result;
  }, []);
  const origin = destinationAtIntent
    ? { x: intent.x - destinationPosition.x, y: intent.y - destinationPosition.y }
    : { x: intent.x - dimensions.width / 2, y: intent.y - dimensions.height / 2 };
  const flowPosition = searchAnchor(origin, (anchor) => {
    const flow = rectangleAt(anchor, dimensions);
    return !obstacles.some((obstacle) => overlaps(flow, obstacle));
  });
  return { flowPosition, sourcePosition, destinationPosition, dimensions };
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
