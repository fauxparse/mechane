// Changing a node's Flow membership, and everything that has to change with
// it (issues #42, #508).
//
// ./graph-commands has the atom — `reparentNode` moves one node and its
// position. This is the policy layer, for the same reason ./graph-cascade is:
// what one user-facing "move into that Flow" is *made of* is a product
// decision, not a property of the graph.
//
// The decision that shapes every function here is that **scope is what makes
// an edge legal**. A Flow-local producer may only feed its own Flow (#29), a
// Navigate edge only means anything between two Scenes in one Flow (#19,
// #25), and only a Flow or a top-level Scene drives a Device (#26). So a move
// that would strand an edge disconnects it rather than refusing — extraction
// used to block on Navigate behavior, and #508 replaced that with cutting the
// Flow-local edges the move invalidates. The alternative is a director who
// cannot get a Scene out of a Flow without hunting down its Cues first.
//
// Navigate edges are the materialized projection of the interaction Actions
// (`projectNavigateEdges`), so disconnecting one means removing its Action,
// not its edge — same rule ./graph-cascade follows when deleting.
//
// The whole move is one composite, so it is one undo entry however many edges
// went with it (#28).
import type { GraphNode, Position, ShowGraph } from "@mechane/domain";

import { composite } from "./command";
import {
  addNode,
  InvalidReparentError,
  removeEdge,
  reparentNode,
  setFlowDefaultScene,
  UnknownGraphTargetError,
} from "./graph-commands";
import type { ShowGraphCommand } from "./graph-commands";
import { removeAction } from "./interaction-commands";

/** Vertical gap between nodes placed in a Flow's column. */
const STACK_GAP = 24;

/** Creates a Flow and optionally puts eligible existing nodes inside it. */
export function createFlowWithNodes(
  graph: ShowGraph,
  flow: GraphNode,
  nodeIds: string[],
  childOrigin: Position,
): ShowGraphCommand {
  if (flow.kind !== "flow") throw new InvalidReparentError("Only a Flow can contain nodes.");
  const graphWithFlow = { ...graph, nodes: [...graph.nodes, flow] };
  const commands: ShowGraphCommand[] = [addNode(flow, "Create Flow")];
  if (nodeIds.length > 0) {
    commands.push(moveNodesIntoFlow(graphWithFlow, nodeIds, flow.id, childOrigin));
  }
  return composite({ label: "Create Flow", commands });
}

/**
 * Moves a node into an empty or populated Flow. The default Scene assignment
 * and the disconnection of stranded edges are welded to membership, so one
 * undo reverses all three.
 */
export function moveNodeIntoFlow(
  graph: ShowGraph,
  nodeId: string,
  flowId: string,
  position: Position,
): ShowGraphCommand {
  return moveNodesIntoFlow(graph, [nodeId], flowId, position);
}

/**
 * Moves several nodes into a Flow as one command. A single node lands exactly
 * at `origin` — a drag has to leave the node under the pointer — while a bulk
 * move stacks them in a column below the Flow's existing children, so neither
 * the existing nor the arriving nodes overlap.
 *
 * Nodes already inside another Flow are welcome: moving between Flows is one
 * move, not an extraction the director has to perform first (#508).
 */
export function moveNodesIntoFlow(
  graph: ShowGraph,
  nodeIds: string[],
  flowId: string,
  origin: Position,
): ShowGraphCommand {
  const flow = graph.nodes.find((candidate) => candidate.id === flowId);
  if (!flow || flow.kind !== "flow") throw new UnknownGraphTargetError("Flow", flowId);

  const nodes = nodeIds.map((nodeId) => {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new UnknownGraphTargetError("node", nodeId);
    if (node.kind === "flow") throw new InvalidReparentError("Flows cannot be nested.");
    if (node.kind === "device") {
      throw new InvalidReparentError("Devices cannot be moved into a Flow.");
    }
    return node;
  });
  if (nodes.length === 0) {
    throw new InvalidReparentError("Select at least one node to move into a Flow.");
  }

  const moving = new Set(nodeIds);
  const children = graph.nodes.filter((node) => node.parentId === flowId && !moving.has(node.id));
  let y =
    nodes.length === 1
      ? origin.y
      : Math.max(
          origin.y,
          ...children.map((node) => node.position.y + nodeHeight(node) + STACK_GAP),
        );

  const parents = new Map(nodeIds.map((nodeId) => [nodeId, flowId] as const));
  const parts = strandedEdgeCommands(graph, parents);
  for (const node of nodes) {
    parts.push(reparentNode(node.id, flowId, { x: origin.x, y }, "Move into Flow"));
    y += nodeHeight(node) + STACK_GAP;
  }
  parts.push(...defaultSceneCommands(graph, parents));
  return composite({ label: "Move into Flow", commands: parts });
}

/**
 * Moves a node to Show level. Flow-local edges — Navigate behavior, and
 * wiring that crossed the boundary — are disconnected, because neither means
 * anything once the node is outside the Flow. Wiring between nodes moving
 * together survives.
 */
export function moveNodeOutOfFlow(
  graph: ShowGraph,
  nodeId: string,
  position: Position,
): ShowGraphCommand {
  return moveNodesOutOfFlow(graph, [nodeId], [position]);
}

/** Moves several Flow-local nodes out of a Flow as one command. */
export function moveNodesOutOfFlow(
  graph: ShowGraph,
  nodeIds: string[],
  positions: readonly Position[],
): ShowGraphCommand {
  if (nodeIds.length === 0 || nodeIds.length !== positions.length) {
    throw new InvalidReparentError("Select at least one Flow-local node to move out.");
  }

  const nodes = nodeIds.map((nodeId) => {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new UnknownGraphTargetError("node", nodeId);
    if (node.parentId === null) {
      throw new InvalidReparentError("Only Flow-local nodes can be moved out.");
    }
    return node;
  });

  const parents = new Map(nodeIds.map((nodeId) => [nodeId, null] as const));
  const parts = strandedEdgeCommands(graph, parents);
  parts.push(...defaultSceneCommands(graph, parents));
  nodes.forEach((node, index) => {
    parts.push(reparentNode(node.id, null, positions[index]!, "Move out of Flow"));
  });
  return composite({ label: "Move out of Flow", commands: parts });
}

/**
 * The edges `parents` strands, as the commands that disconnect them.
 *
 * `parents` maps a node id to the Flow it is about to belong to (`null` for
 * Show level); every other node keeps the parent it has. An edge is only
 * examined when the move touches one of its endpoints, so an unrelated edge
 * is never disturbed by a move elsewhere in the graph.
 */
function strandedEdgeCommands(
  graph: ShowGraph,
  parents: ReadonlyMap<string, string | null>,
): ShowGraphCommand[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const parentAfter = (nodeId: string): string | null =>
    parents.has(nodeId) ? (parents.get(nodeId) ?? null) : (byId.get(nodeId)?.parentId ?? null);

  const stranded = graph.edges.filter((edge) => {
    if (!parents.has(edge.sourceId) && !parents.has(edge.targetId)) return false;
    const source = parentAfter(edge.sourceId);
    const target = parentAfter(edge.targetId);
    switch (edge.kind) {
      case "navigate":
        // A Flow *is* the state machine, so a Navigate edge survives only
        // while both Scenes remain in the same Flow.
        return source === null || source !== target;
      case "wiring":
        // A top-level producer may feed anything; a Flow-local one may only
        // feed its own Flow.
        return source !== null && source !== target;
      case "device":
        // A nested Scene is reached through its Flow, never directly (#26).
        return byId.get(edge.sourceId)?.kind === "scene" && source !== null;
    }
  });

  const actionIds = [
    ...new Set(
      stranded.flatMap((edge) =>
        edge.kind === "navigate" && edge.actionId ? [edge.actionId] : [],
      ),
    ),
  ];
  const removedActions = new Set(actionIds);
  return [
    ...stranded
      .filter(
        (edge) =>
          !(edge.kind === "navigate" && edge.actionId != null && removedActions.has(edge.actionId)),
      )
      .map((edge) =>
        removeEdge(edge.id, edge.kind === "navigate" ? "Remove Navigate" : "Remove wiring"),
      ),
    ...actionIds.map((actionId) => removeAction(actionId)),
  ];
}

/**
 * The default-Scene pointers `parents` invalidates or satisfies: a Flow whose
 * entry Scene is leaving loses the pointer, and a Flow with none gains one
 * when a Scene arrives. Both have to undo with the membership change (#28).
 */
function defaultSceneCommands(
  graph: ShowGraph,
  parents: ReadonlyMap<string, string | null>,
): ShowGraphCommand[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const commands: ShowGraphCommand[] = [];
  const cleared = new Set<string>();
  for (const flow of graph.nodes) {
    if (flow.kind !== "flow") continue;
    const defaultSceneId = flow.defaultSceneId;
    if (defaultSceneId === null || !parents.has(defaultSceneId)) continue;
    if (parents.get(defaultSceneId) !== flow.id) {
      commands.push(setFlowDefaultScene(flow.id, null));
      cleared.add(flow.id);
    }
  }
  for (const [flowId, arrivals] of arrivalsByFlow(parents)) {
    const flow = byId.get(flowId);
    if (flow?.kind !== "flow") continue;
    if (flow.defaultSceneId !== null && !cleared.has(flowId)) continue;
    const firstScene = arrivals.find((nodeId) => byId.get(nodeId)?.kind === "scene");
    if (firstScene) commands.push(setFlowDefaultScene(flowId, firstScene));
  }
  return commands;
}

function arrivalsByFlow(parents: ReadonlyMap<string, string | null>): Map<string, string[]> {
  const arrivals = new Map<string, string[]>();
  for (const [nodeId, flowId] of parents) {
    if (flowId === null) continue;
    const existing = arrivals.get(flowId);
    if (existing) existing.push(nodeId);
    else arrivals.set(flowId, [nodeId]);
  }
  return arrivals;
}

/**
 * How tall a node is for stacking purposes. Deliberately the domain's own
 * arithmetic rather than the editor's measured height: a command has to place
 * nodes identically whether or not anything is rendering.
 */
function nodeHeight(node: GraphNode): number {
  return node.kind === "scene" ? 56 + node.variables.length * 24 + 8 : 56;
}
