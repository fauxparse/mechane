import { and, eq } from "drizzle-orm";

import {
  fieldsForType,
  type Canvas,
  type FlowSize,
  type GraphEdge,
  type GraphNode,
  type Position,
  type ShowGraph,
  transformerOutputType,
} from "@mechane/domain";
import { readCanvasWorkspace, writeCanvasRows } from "../../canvas";
import { db } from "../../client";
import { canvases, showGraphs } from "../../schema";
import { publishShowGraph, writeShowGraph } from "../../show-graph";

export type SeedCanvas = Canvas & { id: string };
export type SeedCanvases = Record<string, SeedCanvas>;

export type SeedShow = {
  readonly name: string;
  readonly seed: (showId: string) => Promise<void>;
};

const SEEDED_CANVAS_WIDTH = 720;
const SEEDED_CANVAS_HEIGHT = 420;
const SEEDED_CANVAS_GAP = 80;
const SEEDED_BLOCK_START_Y = 900;

/** Places seeded Scene Canvases in a row, matching new Scene placement. */
export function seedCanvasPosition(index: number): Position {
  return { x: index * (SEEDED_CANVAS_WIDTH + SEEDED_CANVAS_GAP), y: 0 };
}

const TIDY_NODE_WIDTH = 240;
const TIDY_NODE_HEIGHT = 56;
const TIDY_DEVICE_HEIGHT = 203;
const TIDY_GAP = 96;
const TIDY_FLOW_PADDING = 64;
const TIDY_FLOW_HEADER_HEIGHT = 50;
const TIDY_FLOW_CONTENT_TOP = TIDY_FLOW_HEADER_HEIGHT + TIDY_FLOW_PADDING;

function orderedNodes<T extends GraphNode>(nodes: readonly T[]): T[] {
  return [...nodes].sort(
    (left, right) =>
      left.position.y - right.position.y ||
      left.position.x - right.position.x ||
      left.id.localeCompare(right.id),
  );
}

function orderedScenes(
  flow: Extract<GraphNode, { kind: "flow" }>,
  scenes: readonly Extract<GraphNode, { kind: "scene" }>[],
  edges: readonly GraphEdge[],
): Extract<GraphNode, { kind: "scene" }>[] {
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const nextById = new Map<string, string>();
  for (const edge of edges) {
    if (edge.kind !== "navigate" || !byId.has(edge.sourceId) || !byId.has(edge.targetId)) continue;
    if (!nextById.has(edge.sourceId)) nextById.set(edge.sourceId, edge.targetId);
  }

  const ordered: Extract<GraphNode, { kind: "scene" }>[] = [];
  const seen = new Set<string>();
  let current = flow.defaultSceneId;
  while (current && !seen.has(current)) {
    const scene = byId.get(current);
    if (!scene) break;
    seen.add(current);
    ordered.push(scene);
    current = nextById.get(current) ?? null;
  }
  for (const scene of orderedNodes(scenes)) {
    if (!seen.has(scene.id)) ordered.push(scene);
  }
  return ordered;
}

function absoluteSeedPosition(
  nodeId: string,
  nodes: ReadonlyMap<string, GraphNode>,
): Position | null {
  const node = nodes.get(nodeId);
  if (!node) return null;
  if (!node.parentId) return node.position;
  const parent = nodes.get(node.parentId);
  return parent
    ? { x: parent.position.x + node.position.x, y: parent.position.y + node.position.y }
    : node.position;
}

function tidyFlowSize(
  children: readonly GraphNode[],
  heights: ReadonlyMap<string, number>,
): FlowSize {
  const right = children.reduce(
    (edge, child) => Math.max(edge, child.position.x + TIDY_NODE_WIDTH),
    0,
  );
  const bottom = children.reduce(
    (edge, child) => Math.max(edge, child.position.y + (heights.get(child.id) ?? TIDY_NODE_HEIGHT)),
    0,
  );
  return {
    width: Math.max(TIDY_NODE_WIDTH, right) + TIDY_FLOW_PADDING,
    height: Math.max(TIDY_FLOW_HEADER_HEIGHT + TIDY_NODE_HEIGHT, bottom) + TIDY_FLOW_PADDING,
  };
}
function tidyNodeHeight(node: GraphNode, graph: ShowGraph): number {
  if (node.kind === "device") return TIDY_DEVICE_HEIGHT;
  const cueCount =
    node.kind === "scene"
      ? (graph.cues ?? []).filter(
          (cue) => cue.owner.kind === "scene" && cue.owner.sceneId === node.id,
        ).length
      : 0;
  const type =
    node.kind === "source"
      ? node.type
      : node.kind === "transformer"
        ? transformerOutputType(graph, node)
        : null;
  const rowCount =
    node.kind === "scene"
      ? node.variables.length + cueCount
      : fieldsForType(type, graph.shapes ?? []).length;
  return rowCount === 0 ? TIDY_NODE_HEIGHT : TIDY_NODE_HEIGHT + rowCount * 24 + 8;
}

/**
 * Applies the same spacious, Flow-aware layout policy used by the editor to
 * persisted seed graphs. Seed authors provide topology; this boundary owns
 * the incidental canvas coordinates.
 */
export function tidySeedGraph(graph: ShowGraph): ShowGraph {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string | null, GraphNode[]>();
  for (const node of graph.nodes) {
    const parentId = node.parentId ?? null;
    const children = childrenByParent.get(parentId);
    if (children) children.push(node);
    else childrenByParent.set(parentId, [node]);
  }
  const heights = new Map(graph.nodes.map((node) => [node.id, tidyNodeHeight(node, graph)]));
  const flowSizes = new Map<string, FlowSize>();
  const rootNodes = graph.nodes.filter((node) => !node.parentId);

  for (const flow of graph.nodes) {
    if (flow.kind !== "flow") continue;
    const children = childrenByParent.get(flow.id) ?? [];
    const scenes = orderedScenes(
      flow,
      children.filter(
        (node): node is Extract<GraphNode, { kind: "scene" }> => node.kind === "scene",
      ),
      graph.edges,
    );
    const others = orderedNodes(children.filter((node) => node.kind !== "scene"));
    const planned: GraphNode[] = [];
    let x = TIDY_FLOW_PADDING;
    let sceneBottom = TIDY_FLOW_CONTENT_TOP;
    const sceneColumns = new Map<string, Position>();

    for (const scene of scenes) {
      const position = { x, y: TIDY_FLOW_CONTENT_TOP };
      nodes.set(scene.id, { ...scene, position });
      planned.push({ ...scene, position });
      sceneColumns.set(scene.id, position);
      sceneBottom = Math.max(sceneBottom, position.y + (heights.get(scene.id) ?? TIDY_NODE_HEIGHT));
      x += TIDY_NODE_WIDTH + TIDY_GAP;
    }

    const otherY = scenes.length > 0 ? sceneBottom + TIDY_GAP : TIDY_FLOW_CONTENT_TOP;
    let nextOtherX = TIDY_FLOW_PADDING;
    for (const child of others) {
      const target = graph.edges.find(
        (edge) => edge.sourceId === child.id && sceneColumns.has(edge.targetId),
      );
      const targetPosition = target ? sceneColumns.get(target.targetId) : undefined;
      const position = {
        x: Math.max(targetPosition?.x ?? nextOtherX, nextOtherX),
        y: otherY,
      };
      nodes.set(child.id, { ...child, position });
      planned.push({ ...child, position });
      nextOtherX = position.x + TIDY_NODE_WIDTH + TIDY_GAP;
    }
    flowSizes.set(flow.id, tidyFlowSize(planned, heights));
  }

  const leftNodes = rootNodes.filter((node) => node.kind !== "flow" && node.kind !== "device");
  const rootFlows = rootNodes.filter(
    (node): node is Extract<GraphNode, { kind: "flow" }> => node.kind === "flow",
  );
  const baseX = rootNodes.length > 0 ? Math.min(...rootNodes.map((node) => node.position.x)) : 0;
  const baseY = rootNodes.length > 0 ? Math.min(...rootNodes.map((node) => node.position.y)) : 0;
  const flowX = baseX + (leftNodes.length > 0 ? TIDY_NODE_WIDTH + TIDY_GAP : 0);

  let flowY = baseY;
  for (const flow of rootFlows) {
    const position = { x: flowX, y: flowY };
    nodes.set(flow.id, { ...flow, position, size: flowSizes.get(flow.id) });
    flowY += (flowSizes.get(flow.id)?.height ?? TIDY_NODE_HEIGHT) + TIDY_GAP;
  }

  let leftY = baseY;
  for (const node of leftNodes) {
    const position = { x: baseX, y: leftY };
    nodes.set(node.id, { ...node, position });
    leftY += heights.get(node.id) ?? TIDY_NODE_HEIGHT;
    leftY += TIDY_GAP;
  }

  const nonDeviceRoots = rootNodes.filter((node) => node.kind !== "device");
  const graphRight =
    nonDeviceRoots.length > 0
      ? Math.max(
          ...nonDeviceRoots.map(
            (node) =>
              (nodes.get(node.id)?.position.x ?? node.position.x) +
              (flowSizes.get(node.id)?.width ?? TIDY_NODE_WIDTH),
          ),
        )
      : baseX + TIDY_NODE_WIDTH;
  const deviceX = graphRight + TIDY_GAP;
  const devices = rootNodes.filter((node) => node.kind === "device");
  const devicePlans = devices.map((device) => {
    const edge = graph.edges.find(
      (candidate) => candidate.kind === "device" && candidate.targetId === device.id,
    );
    const source = edge ? absoluteSeedPosition(edge.sourceId, nodes) : null;
    const sourceHeight = edge
      ? (flowSizes.get(edge.sourceId)?.height ?? heights.get(edge.sourceId) ?? TIDY_NODE_HEIGHT)
      : TIDY_NODE_HEIGHT;
    return {
      device,
      desiredY: source ? source.y + sourceHeight / 2 - TIDY_DEVICE_HEIGHT / 2 : baseY,
    };
  });
  devicePlans.sort(
    (left, right) =>
      left.desiredY - right.desiredY || left.device.id.localeCompare(right.device.id),
  );
  let deviceY = baseY;
  for (const { device, desiredY } of devicePlans) {
    const position = { x: deviceX, y: Math.max(deviceY, desiredY) };
    nodes.set(device.id, { ...device, position });
    deviceY = position.y + TIDY_DEVICE_HEIGHT + TIDY_GAP;
  }

  return { ...graph, nodes: graph.nodes.map((node) => nodes.get(node.id) ?? node) };
}
/** Places seeded Block Canvases in a column below the Scene row. */
export function seedBlockCanvasPosition(index: number): Position {
  return {
    x: 0,
    y: SEEDED_BLOCK_START_Y + index * (SEEDED_CANVAS_HEIGHT + SEEDED_CANVAS_GAP),
  };
}

export async function assertSeedCanvases(
  showId: string,
  state: "draft" | "published",
  graph: ShowGraph,
): Promise<void> {
  const expectedSceneIds = new Set(
    graph.nodes.filter((node) => node.kind === "scene").map((node) => node.id),
  );
  const workspace = await readCanvasWorkspace(showId, state);
  const actualSceneIds = new Set(
    workspace.canvases.filter((canvas) => canvas.kind === "scene").map((canvas) => canvas.ownerId),
  );
  const missingScenes = [...expectedSceneIds].filter((sceneId) => !actualSceneIds.has(sceneId));
  if (missingScenes.length > 0) {
    throw new Error(
      `Seeded ${state} graph is missing Canvases for Scenes: ${missingScenes.join(", ")}`,
    );
  }
  const expectedBlockIds = new Set((graph.blocks ?? []).map((block) => block.id));
  const actualBlockIds = new Set(
    workspace.canvases.filter((canvas) => canvas.kind === "block").map((canvas) => canvas.ownerId),
  );
  const missingBlocks = [...expectedBlockIds].filter((blockId) => !actualBlockIds.has(blockId));
  if (missingBlocks.length > 0) {
    throw new Error(
      `Seeded ${state} graph is missing Canvases for Blocks: ${missingBlocks.join(", ")}`,
    );
  }
}

async function seedCanvases(
  showId: string,
  state: "draft" | "published",
  graph: ShowGraph,
  canvases: SeedCanvases,
): Promise<Map<string, string>> {
  const [graphRow] = await db
    .select({ id: showGraphs.id })
    .from(showGraphs)
    .where(and(eq(showGraphs.showId, showId), eq(showGraphs.state, state)));
  if (!graphRow) throw new Error(`Seeded ${state} graph for Show "${showId}" was not found.`);
  return db.transaction(async (tx) => {
    const now = new Date();
    const canvasIds = new Map<string, string>();
    for (const [index, [sceneId, canvas]] of Object.entries(canvases).entries()) {
      const scene = graph.nodes.find((node) => node.id === sceneId && node.kind === "scene");
      if (!scene || scene.kind !== "scene")
        throw new Error(`Seed canvas "${sceneId}" has no Scene node.`);
      const canvasId = await writeCanvasRows(
        tx,
        showId,
        graphRow.id,
        { sceneNodeId: sceneId },
        canvas,
        now,
        seedCanvasPosition(index),
      );
      canvasIds.set(sceneId, canvasId);
      if (typeof canvas.id === "string") canvasIds.set(canvas.id, canvasId);
    }
    return canvasIds;
  });
}

async function seedBlockCanvases(
  showId: string,
  state: "draft" | "published",
  graph: ShowGraph,
): Promise<void> {
  const blocks = graph.blocks ?? [];
  if (blocks.length === 0) return;
  const [graphRow] = await db
    .select({ id: showGraphs.id })
    .from(showGraphs)
    .where(and(eq(showGraphs.showId, showId), eq(showGraphs.state, state)));
  if (!graphRow) throw new Error(`Seeded ${state} graph for Show "${showId}" was not found.`);
  // Position only. Writing the Canvas whole would re-insert its Elements, and
  // `graph_event_bindings` cascades on `(canvas_id, element_id)` — so a Block
  // Canvas rewritten after its Bindings were stored takes them with it. That
  // is what silently dropped the Voting Show's candidate button Binding: the
  // Elements are already written by the graph write, and all this step was
  // ever for is laying the Block Canvases out below the Scene row.
  await db.transaction(async (tx) => {
    const now = new Date();
    for (const [index, block] of blocks.entries()) {
      const position = seedBlockCanvasPosition(index);
      await tx
        .update(canvases)
        .set({ positionX: position.x, positionY: position.y, updatedAt: now })
        .where(and(eq(canvases.graphId, graphRow.id), eq(canvases.blockId, block.id)));
    }
  });
}

export async function seedShowData(
  showId: string,
  buildGraph: () => ShowGraph,
  buildCanvases: () => SeedCanvases,
  seedAssets?: (showId: string) => Promise<void>,
): Promise<void> {
  const graph = tidySeedGraph(buildGraph());
  const canvases = buildCanvases();
  await seedAssets?.(showId);
  const initialGraph =
    (graph.eventBindings?.length ?? 0) > 0 ? { ...graph, eventBindings: [] } : graph;
  await writeShowGraph(showId, "draft", initialGraph);
  const draftCanvasIds = await seedCanvases(showId, "draft", initialGraph, canvases);
  const graphWithBindings =
    (graph.eventBindings?.length ?? 0) > 0
      ? {
          ...graph,
          eventBindings: (graph.eventBindings ?? []).map((binding) => ({
            ...binding,
            canvasId: draftCanvasIds.get(binding.canvasId) ?? binding.canvasId,
          })),
        }
      : graph;
  if (graphWithBindings.eventBindings?.length) {
    await writeShowGraph(showId, "draft", graphWithBindings);
  }
  await seedBlockCanvases(showId, "draft", graphWithBindings);
  await assertSeedCanvases(showId, "draft", graphWithBindings);
  if (graphWithBindings.eventBindings?.length) {
    await writeShowGraph(showId, "published", initialGraph);
    await seedCanvases(showId, "published", initialGraph, canvases);
  }
  await publishShowGraph(showId);
  if (!graphWithBindings.eventBindings?.length) {
    await seedCanvases(showId, "published", graphWithBindings, canvases);
  }
  await seedBlockCanvases(showId, "published", graphWithBindings);
  await assertSeedCanvases(showId, "published", graphWithBindings);
}
