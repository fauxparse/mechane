// The primitive Show-graph commands (issue #41), over @mechane/domain's
// `ShowGraph`.
//
// These are the *atoms*: add or remove one node, move one node, rename one
// node, add or remove one edge, add/rename/remove a Scene Variable, change a
// Flow's default Scene. The interaction slice (#42) composes them into the operations a director
// actually performs — a recursive Flow delete, a move-into-Flow operation with its
// side effects — because which nodes a cascade collects is a policy question
// about the editor, while "removing a node takes its edges with it" is just
// what the graph *is*.
//
// Two rules the atoms do hold to, because neither is optional:
//
//   - **Every removal captures what it destroyed** (#28) — the node, its
//     position, every incident edge, each at its original index, plus any
//     reference to it that had to be cleared. The inverse restores the graph
//     to a byte-identical shape, not an equivalent-looking one, which is
//     what makes one Cmd+Z after a cascading delete trustworthy.
//   - **Order is preserved.** Graph order is stable, visible data (the
//     mapper in apps/studio orders Flows before their children off the back
//     of it), so a restore splices things back where they were rather than
//     appending them.
//
// What's deliberately not here: validation. `assertValidShowGraph` runs at
// the storage boundary, not per command, because a composite legitimately
// passes through invalid intermediate states — a cascade removes a Flow's
// children before the Flow, and its inverse restores the Flow before its
// children. Validating each atom would reject the very sequences that make
// the composite correct.

import type {
  DeviceNode,
  FlowColor,
  GraphEdge,
  GraphNode,
  Position,
  SceneNode,
  SceneVariable,
  Shape,
  ShowGraph,
  Type,
} from "@mechane/domain";

import type { Command } from "./command";
import { capturing, composite } from "./command";
import type { GraphEdit } from "./graph-edits";

/**
 * A command over a Show graph, which also knows how to say what it did on the
 * wire (#103) — see ./graph-edits for the vocabulary, and note that the
 * *inverse* of one of these carries edits too, so an undo is transmitted the
 * same way as any other edit (ADR-0005).
 */
export type ShowGraphCommand = Command<ShowGraph, GraphEdit>;

/** Command `type` strings, so surfaces can recognise commands they care about. */
export const GRAPH_COMMAND_TYPES = {
  addNode: "graph.addNode",
  removeNode: "graph.removeNode",
  moveNode: "graph.moveNode",
  renameNode: "graph.renameNode",
  reparentNode: "graph.reparentNode",
  addEdge: "graph.addEdge",
  removeEdge: "graph.removeEdge",
  setFlowDefaultScene: "graph.setFlowDefaultScene",
  setNodeColor: "graph.setNodeColor",
  setShapes: "graph.setShapes",
  addSceneVariable: "graph.addSceneVariable",
  renameSceneVariable: "graph.renameSceneVariable",
  setSceneVariableType: "graph.setSceneVariableType",
  reorderSceneVariables: "graph.reorderSceneVariables",
  removeSceneVariable: "graph.removeSceneVariable",
  moveNodeOutOfFlow: "graph.moveNodeOutOfFlow",
  setDevicePairingCode: "graph.setDevicePairingCode",
  setDevicePerConnection: "graph.setDevicePerConnection",
} as const;

export class UnknownGraphTargetError extends Error {
  constructor(what: string, id: string) {
    super(`Show graph has no ${what} "${id}".`);
    this.name = "UnknownGraphTargetError";
  }
}

/** A structural move was refused without changing the graph. */
export class InvalidReparentError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidReparentError";
  }
}

function nodeIndex(graph: ShowGraph, nodeId: string): number {
  const index = graph.nodes.findIndex((node) => node.id === nodeId);
  if (index === -1) throw new UnknownGraphTargetError("node", nodeId);
  return index;
}

function edgeIndex(graph: ShowGraph, edgeId: string): number {
  const index = graph.edges.findIndex((edge) => edge.id === edgeId);
  if (index === -1) throw new UnknownGraphTargetError("edge", edgeId);
  return index;
}

/** `graph` with the node at `index` replaced by `replacement`. */
function replaceNode(graph: ShowGraph, index: number, replacement: GraphNode): ShowGraph {
  const nodes = [...graph.nodes];
  nodes[index] = replacement;
  return { ...graph, nodes };
}

/** `graph` with `node` spliced in at `index` — restoring, not appending. */
function insertNode(graph: ShowGraph, index: number, node: GraphNode): ShowGraph {
  const nodes = [...graph.nodes];
  nodes.splice(Math.min(index, nodes.length), 0, node);
  return { ...graph, nodes };
}

function insertEdge(graph: ShowGraph, index: number, edge: GraphEdge): ShowGraph {
  const edges = [...graph.edges];
  edges.splice(Math.min(index, edges.length), 0, edge);
  return { ...graph, edges };
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

/**
 * Adds `node` to the graph. Trivially invertible — the inverse is the
 * removal of that node (#28) — so the interesting case is the other
 * direction, below.
 */
export function addNode(node: GraphNode, label = `Add ${node.kind}`): ShowGraphCommand {
  return capturing<ShowGraph, null, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.addNode,
    label,
    // Creation needs the canvas, not a selection: it comes from a
    // right-click on empty space or a palette entry (#37, #42).
    scope: "canvas",
    edits: [{ type: GRAPH_COMMAND_TYPES.addNode, node }],
    restoreEdits: () => [{ type: GRAPH_COMMAND_TYPES.removeNode, nodeId: node.id }],
    capture: () => null,
    apply: (graph) => ({ ...graph, nodes: [...graph.nodes, node] }),
    restore: (graph) => ({
      ...graph,
      nodes: graph.nodes.filter((existing) => existing.id !== node.id),
    }),
  });
}

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

/** Everything one node's removal destroyed, captured as it happened (#28). */
interface RemovedNode {
  index: number;
  node: GraphNode;
  /** Incident edges with the index each sat at, ascending. */
  edges: { index: number; edge: GraphEdge }[];
  /** Flows whose `defaultSceneId` pointed at this node and had to be cleared. */
  defaultSceneFlowIds: string[];
}

/**
 * Removes one node, the edges that touched it, and any Flow's reference to
 * it as a default Scene — capturing all three, so the inverse rebuilds it
 * exactly (#28).
 *
 * The default-Scene clearing is the small case of #28's "side effects live
 * inside the snapshot": deleting a Flow's entry Scene has to leave the Flow
 * without one, and one undo has to bring back both the Scene and the Flow's
 * pointer to it. Same principle as moving into a Flow's auto-assignment, one order of
 * magnitude smaller.
 *
 * This removes *one* node. Nested Scenes inside a deleted Flow are the
 * cascade policy in #42 — composed from several of these, which is what
 * makes the cascade one undo entry.
 */
export function removeNode(nodeId: string, label?: string): ShowGraphCommand {
  return capturing<ShowGraph, RemovedNode, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.removeNode,
    label: label ?? "Delete",
    scope: "selection",
    edits: [{ type: GRAPH_COMMAND_TYPES.removeNode, nodeId }],
    // The node first, then what referred to it: an edge can't be added to a
    // graph whose endpoint isn't back yet, and a Flow can't point at a
    // default Scene that doesn't exist. The indices the capture holds are
    // for this process only — the wire doesn't carry graph order, and the
    // server doesn't store it (./graph-edits).
    restoreEdits: (captured) => [
      { type: GRAPH_COMMAND_TYPES.addNode, node: captured.node },
      ...captured.edges.map(({ edge }) => ({ type: GRAPH_COMMAND_TYPES.addEdge, edge }) as const),
      ...captured.defaultSceneFlowIds.map(
        (flowId) =>
          ({ type: GRAPH_COMMAND_TYPES.setFlowDefaultScene, flowId, sceneId: nodeId }) as const,
      ),
    ],
    capture: (graph) => {
      const index = nodeIndex(graph, nodeId);
      const node = graph.nodes[index] as GraphNode;
      return {
        index,
        node,
        edges: graph.edges
          .map((edge, edgeIdx) => ({ index: edgeIdx, edge }))
          .filter(({ edge }) => edge.sourceId === nodeId || edge.targetId === nodeId),
        defaultSceneFlowIds: graph.nodes
          .filter((other) => other.kind === "flow" && other.defaultSceneId === nodeId)
          .map((other) => other.id),
      };
    },
    apply: (graph) => ({
      nodes: graph.nodes
        .filter((node) => node.id !== nodeId)
        .map((node) =>
          node.kind === "flow" && node.defaultSceneId === nodeId
            ? { ...node, defaultSceneId: null }
            : node,
        ),
      edges: graph.edges.filter((edge) => edge.sourceId !== nodeId && edge.targetId !== nodeId),
    }),
    restore: (graph, captured) => {
      let next = insertNode(graph, captured.index, captured.node);
      // Ascending indices, so each splice lands where it was: restoring the
      // earlier edge first keeps the later one's index meaningful.
      for (const { index, edge } of captured.edges) {
        next = insertEdge(next, index, edge);
      }
      const flows = new Set(captured.defaultSceneFlowIds);
      if (flows.size > 0) {
        next = {
          ...next,
          nodes: next.nodes.map((node) =>
            node.kind === "flow" && flows.has(node.id) ? { ...node, defaultSceneId: nodeId } : node,
          ),
        };
      }
      return next;
    },
  });
}

/**
 * Moves a node. The command a drag gesture emits per frame — see
 * `CommandStack.beginGesture`, which is what collapses a whole drag into one
 * undo entry (#28).
 *
 * A move to where the node already is reports itself empty, so a click that
 * jiggles a node by nothing doesn't land an entry.
 */
export function moveNode(nodeId: string, position: Position, label = "Move"): ShowGraphCommand {
  return capturing<ShowGraph, Position, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.moveNode,
    label,
    scope: "selection",
    // Absolute, so a drag's frames collapse to the last one (./stack).
    coalesceKey: `${GRAPH_COMMAND_TYPES.moveNode}:${nodeId}`,
    edits: [{ type: GRAPH_COMMAND_TYPES.moveNode, nodeId, position }],
    restoreEdits: (captured) => [
      { type: GRAPH_COMMAND_TYPES.moveNode, nodeId, position: captured },
    ],
    capture: (graph) => {
      const node = graph.nodes[nodeIndex(graph, nodeId)] as GraphNode;
      return { ...node.position };
    },
    isEmpty: (_graph, captured) => captured.x === position.x && captured.y === position.y,
    apply: (graph) => {
      const index = nodeIndex(graph, nodeId);
      const node = graph.nodes[index] as GraphNode;
      return replaceNode(graph, index, { ...node, position: { ...position } });
    },
    restore: (graph, captured) => {
      const index = nodeIndex(graph, nodeId);
      const node = graph.nodes[index] as GraphNode;
      return replaceNode(graph, index, { ...node, position: { ...captured } });
    },
  });
}

/**
 * Renames a node. Emitted per keystroke by an inline rename field and
 * coalesced by the gesture that wraps it, so typing "Voting" is one undo
 * entry and not six (#28).
 */
export function renameNode(nodeId: string, name: string, label = "Rename"): ShowGraphCommand {
  return capturing<ShowGraph, string, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.renameNode,
    label,
    scope: "selection",
    // Typing "Voting" is six commands and one name (./stack).
    coalesceKey: `${GRAPH_COMMAND_TYPES.renameNode}:${nodeId}`,
    edits: [{ type: GRAPH_COMMAND_TYPES.renameNode, nodeId, name }],
    restoreEdits: (captured) => [{ type: GRAPH_COMMAND_TYPES.renameNode, nodeId, name: captured }],
    capture: (graph) => (graph.nodes[nodeIndex(graph, nodeId)] as GraphNode).name,
    isEmpty: (_graph, captured) => captured === name,
    apply: (graph) => {
      const index = nodeIndex(graph, nodeId);
      return replaceNode(graph, index, { ...(graph.nodes[index] as GraphNode), name });
    },
    restore: (graph, captured) => {
      const index = nodeIndex(graph, nodeId);
      return replaceNode(graph, index, { ...(graph.nodes[index] as GraphNode), name: captured });
    },
  });
}

/** A node's placement: which Flow contains it, and where it sits. */
interface Placement {
  parentId: string | null;
  position: Position;
}

/**
 * Moves a node into a Flow or out to Show level — the membership half of
 * moving into and out of a Flow (#42). Position moves with it, because a Flow-local
 * node's position is relative to its Flow (#29) and keeping the old
 * coordinates would fling the node somewhere arbitrary.
 *
 * The *side effects* of moving into a Flow (auto-assigning the Flow's default Scene
 * when it was empty) are separate commands, composed with this one into a
 * single entry — see `setFlowDefaultScene` and #28.
 */
export function reparentNode(
  nodeId: string,
  parentId: string | null,
  position: Position,
  label = parentId === null ? "Move out of Flow" : "Move into Flow",
): ShowGraphCommand {
  return capturing<ShowGraph, Placement, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.reparentNode,
    label,
    scope: "selection",
    coalesceKey: `${GRAPH_COMMAND_TYPES.reparentNode}:${nodeId}`,
    edits: [{ type: GRAPH_COMMAND_TYPES.reparentNode, nodeId, parentId, position }],
    restoreEdits: (captured) => [
      {
        type: GRAPH_COMMAND_TYPES.reparentNode,
        nodeId,
        parentId: captured.parentId,
        position: captured.position,
      },
    ],
    capture: (graph) => {
      const node = graph.nodes[nodeIndex(graph, nodeId)] as GraphNode;
      return { parentId: node.parentId, position: { ...node.position } };
    },
    apply: (graph) => {
      const index = nodeIndex(graph, nodeId);
      const node = graph.nodes[index] as GraphNode;
      if (node.kind === "flow" || node.kind === "device") {
        throw new InvalidReparentError(
          `${node.kind === "flow" ? "Flows" : "Devices"} cannot be nested.`,
        );
      }
      if (parentId !== null) {
        const parent = graph.nodes.find((candidate) => candidate.id === parentId);
        if (!parent || parent.kind !== "flow") {
          throw new InvalidReparentError("A node can only be placed inside a Flow.");
        }
        if (node.parentId !== null && node.parentId !== parentId) {
          throw new InvalidReparentError(
            "Move the Scene out of its Flow before moving it into another.",
          );
        }
      }
      // Cast: only Scenes, Sources, and Transformers are ever reparented
      // (#23, #26 type Flow and Device `parentId` as `null`), and the
      // caller is the one that knows which it has. Structural legality is
      // `assertValidShowGraph`'s call at the boundary.
      return replaceNode(graph, index, {
        ...node,
        parentId,
        position: { ...position },
      } as GraphNode);
    },
    restore: (graph, captured) => {
      const index = nodeIndex(graph, nodeId);
      const node = graph.nodes[index] as GraphNode;
      return replaceNode(graph, index, {
        ...node,
        parentId: captured.parentId,
        position: { ...captured.position },
      } as GraphNode);
    },
  });
}

/**
 * Moves a top-level node into an empty or populated Flow. The default Scene
 * assignment is welded to membership, so one undo reverses both effects.
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
 * Moves several top-level nodes into a Flow as one command. Nodes are placed in a
 * column below the Flow's existing children, starting at `origin`; this keeps
 * the operation deterministic and prevents either existing or newly moved
 * nodes from overlapping.
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
    if (node.kind === "flow" || node.kind === "device") {
      throw new InvalidReparentError("Devices cannot be moved into a Flow.");
    }
    if (node.parentId !== null) {
      throw new InvalidReparentError("Move the node out of its Flow first.");
    }
    return node;
  });
  if (nodes.length === 0)
    throw new InvalidReparentError("Select at least one node to move into a Flow.");

  const children = graph.nodes.filter((node) => node.parentId === flowId);
  // A single drag target must stay under the pointer. Bulk moves retain the
  // non-overlapping column placement used by palette and create-flow actions.
  let y =
    nodes.length === 1
      ? origin.y
      : Math.max(origin.y, ...children.map((node) => node.position.y + nodeHeight(node) + 24));
  const parts: ShowGraphCommand[] = [];
  for (const node of nodes) {
    parts.push(reparentNode(node.id, flowId, { x: origin.x, y }, "Move into Flow"));
    y += nodeHeight(node) + 24;
  }
  if (flow.defaultSceneId === null) {
    const firstScene = nodes.find((node) => node.kind === "scene");
    if (firstScene) parts.push(setFlowDefaultScene(flowId, firstScene.id));
  }
  return composite({ label: "Move into Flow", commands: parts });
}

function nodeHeight(node: GraphNode): number {
  return node.kind === "scene" ? 56 + node.variables.length * 24 + 8 : 56;
}

/**
 * Moves a node to Show level. Navigate edges are removed because top-level
 * Scenes cannot participate in the Flow-local state machine. Wiring edges to
 * unselected nodes are disposable; wiring between moved nodes is preserved.
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

  const selected = new Set(nodeIds);
  const parts: ShowGraphCommand[] = graph.edges
    .filter((edge) => {
      const touchesSelected = selected.has(edge.sourceId) || selected.has(edge.targetId);
      if (!touchesSelected) return false;
      if (edge.kind === "navigate") return true;
      // Wiring between moved nodes remains valid after both nodes change scope;
      // only wiring crossing the extraction boundary is discarded.
      return selected.has(edge.sourceId) !== selected.has(edge.targetId);
    })
    .map((edge) =>
      removeEdge(edge.id, edge.kind === "navigate" ? "Remove Navigate" : "Remove wiring"),
    );
  const defaultOwners = graph.nodes.filter(
    (node) =>
      node.kind === "flow" && node.defaultSceneId !== null && selected.has(node.defaultSceneId),
  );
  for (const owner of defaultOwners) parts.push(setFlowDefaultScene(owner.id, null));
  nodes.forEach((node, index) => {
    parts.push(reparentNode(node.id, null, positions[index]!, "Move out of Flow"));
  });
  return composite({ label: "Move out of Flow", commands: parts });
}

/**
 * Sets (or clears) a Flow's design-time entry Scene (#23). Small on its own;
 * its reason for existing is composition — moving a node into an empty Flow
 * auto-assigns the default Scene, and that assignment must undo together
 * with the membership change (#28).
 */
export function setFlowDefaultScene(
  flowId: string,
  sceneId: string | null,
  label = "Set default Scene",
): ShowGraphCommand {
  return capturing<ShowGraph, string | null, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setFlowDefaultScene,
    label,
    scope: "selection",
    coalesceKey: `${GRAPH_COMMAND_TYPES.setFlowDefaultScene}:${flowId}`,
    edits: [{ type: GRAPH_COMMAND_TYPES.setFlowDefaultScene, flowId, sceneId }],
    restoreEdits: (captured) => [
      { type: GRAPH_COMMAND_TYPES.setFlowDefaultScene, flowId, sceneId: captured },
    ],
    capture: (graph) => {
      const node = graph.nodes[nodeIndex(graph, flowId)] as GraphNode;
      if (node.kind !== "flow") {
        throw new UnknownGraphTargetError("Flow", flowId);
      }
      return node.defaultSceneId;
    },
    isEmpty: (_graph, captured) => captured === sceneId,
    apply: (graph) => withFlowDefaultScene(graph, flowId, sceneId),
    restore: (graph, captured) => withFlowDefaultScene(graph, flowId, captured),
  });
}

function withFlowDefaultScene(graph: ShowGraph, flowId: string, sceneId: string | null): ShowGraph {
  const index = nodeIndex(graph, flowId);
  const node = graph.nodes[index] as GraphNode;
  if (node.kind !== "flow") throw new UnknownGraphTargetError("Flow", flowId);
  return replaceNode(graph, index, { ...node, defaultSceneId: sceneId });
}

/** Sets any Show node's editor colorway (#316). */
export function setNodeColor(
  nodeId: string,
  color: FlowColor | null,
  label = "Set node color",
): ShowGraphCommand {
  return capturing<ShowGraph, FlowColor | undefined, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setNodeColor,
    label,
    scope: "selection",
    coalesceKey: `${GRAPH_COMMAND_TYPES.setNodeColor}:${nodeId}`,
    edits: [{ type: GRAPH_COMMAND_TYPES.setNodeColor, nodeId, color }],
    restoreEdits: (captured) => [
      {
        type: GRAPH_COMMAND_TYPES.setNodeColor,
        nodeId,
        color: captured ?? null,
      },
    ],
    capture: (graph) => (graph.nodes[nodeIndex(graph, nodeId)] as GraphNode).color,
    isEmpty: (_graph, captured) => (captured ?? "neutral") === (color ?? "neutral"),
    apply: (graph) => withNodeColor(graph, nodeId, color),
    restore: (graph, captured) => withNodeColor(graph, nodeId, captured ?? null),
  });
}

function withNodeColor(graph: ShowGraph, nodeId: string, color: FlowColor | null): ShowGraph {
  const index = nodeIndex(graph, nodeId);
  const node = graph.nodes[index] as GraphNode;
  const next = { ...node };
  if (color === null) delete next.color;
  else next.color = color;
  return replaceNode(graph, index, next);
}

/** Replaces the Show-scoped Shape definitions as one undoable edit. */
export function setShapes(shapes: Shape[], label = "Update Shapes"): ShowGraphCommand {
  return capturing<ShowGraph, Shape[], GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setShapes,
    label,
    scope: "global",
    coalesceKey: GRAPH_COMMAND_TYPES.setShapes,
    edits: [{ type: GRAPH_COMMAND_TYPES.setShapes, shapes }],
    restoreEdits: (captured) => [{ type: GRAPH_COMMAND_TYPES.setShapes, shapes: captured }],
    capture: (graph) => graph.shapes ?? [],
    isEmpty: (graph) => JSON.stringify(graph.shapes ?? []) === JSON.stringify(shapes),
    apply: (graph) => ({ ...graph, shapes }),
    restore: (graph, captured) => ({ ...graph, shapes: captured }),
  });
}

/**
 * Records the pairing code the server minted for a Device (#45, #111).
 *
 * The one command in this file the *user* never issues. Device ids are
 * generated client-side (#47) so a Device exists on the canvas before any
 * round trip, but its code can only be minted where uniqueness is
 * enforceable — so the server answers a batch that created one with this, and
 * the editor applies it to the graph it is already editing.
 *
 * It is a command rather than a field the editor fishes out of a response
 * because that is what it is: a change to the graph, arriving from elsewhere.
 * What it must *not* be is an undo entry — "undo the server telling me the
 * code" is not an edit the director made, and `CommandStack.amend` is the
 * door that keeps it off the stack.
 */
export function setDevicePairingCode(
  nodeId: string,
  pairingCode: string | null,
  label = "Pairing code",
): ShowGraphCommand {
  return capturing<ShowGraph, string | null, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setDevicePairingCode,
    label,
    scope: "global",
    coalesceKey: `${GRAPH_COMMAND_TYPES.setDevicePairingCode}:${nodeId}`,
    edits: [{ type: GRAPH_COMMAND_TYPES.setDevicePairingCode, nodeId, pairingCode }],
    restoreEdits: (captured) => [
      { type: GRAPH_COMMAND_TYPES.setDevicePairingCode, nodeId, pairingCode: captured },
    ],
    capture: (graph) => deviceAt(graph, nodeId).device.pairingCode,
    isEmpty: (_graph, captured) => captured === pairingCode,
    apply: (graph) => withPairingCode(graph, nodeId, pairingCode),
    restore: (graph, captured) => withPairingCode(graph, nodeId, captured),
  });
}

function deviceAt(graph: ShowGraph, nodeId: string): { index: number; device: DeviceNode } {
  const index = nodeIndex(graph, nodeId);
  const device = graph.nodes[index] as GraphNode;
  if (device.kind !== "device") throw new UnknownGraphTargetError("Device", nodeId);
  return { index, device };
}

function withPairingCode(graph: ShowGraph, nodeId: string, pairingCode: string | null): ShowGraph {
  const { index, device } = deviceAt(graph, nodeId);
  return replaceNode(graph, index, { ...device, pairingCode });
}

/** Sets whether a Device is one instance or one per connection. */
export function setDevicePerConnection(
  nodeId: string,
  perConnection: boolean,
  label = "Set individual devices",
): ShowGraphCommand {
  return capturing<ShowGraph, boolean, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setDevicePerConnection,
    label,
    scope: "selection",
    coalesceKey: `${GRAPH_COMMAND_TYPES.setDevicePerConnection}:${nodeId}`,
    edits: [{ type: GRAPH_COMMAND_TYPES.setDevicePerConnection, nodeId, perConnection }],
    restoreEdits: (captured) => [
      { type: GRAPH_COMMAND_TYPES.setDevicePerConnection, nodeId, perConnection: captured },
    ],
    capture: (graph) => deviceAt(graph, nodeId).device.perConnection,
    isEmpty: (_graph, captured) => captured === perConnection,
    apply: (graph) => withPerConnection(graph, nodeId, perConnection),
    restore: (graph, captured) => withPerConnection(graph, nodeId, captured),
  });
}

function withPerConnection(graph: ShowGraph, nodeId: string, perConnection: boolean): ShowGraph {
  const { index, device } = deviceAt(graph, nodeId);
  return replaceNode(graph, index, { ...device, perConnection });
}

// ---------------------------------------------------------------------------
// Scene Variables
// ---------------------------------------------------------------------------

function sceneAt(graph: ShowGraph, sceneId: string): { index: number; scene: SceneNode } {
  const index = nodeIndex(graph, sceneId);
  const scene = graph.nodes[index] as GraphNode;
  if (scene.kind !== "scene") throw new UnknownGraphTargetError("Scene", sceneId);
  return { index, scene };
}

function withVariables(graph: ShowGraph, sceneId: string, variables: SceneVariable[]): ShowGraph {
  const { index, scene } = sceneAt(graph, sceneId);
  return replaceNode(graph, index, { ...scene, variables });
}

function variableRank(index: number): string {
  return String(index).padStart(10, "0");
}

/**
 * Adds a Variable to a Scene — a named input port, not a node (#20). Variables
 * are edited here rather than through their own surface because that's what
 * they are: a property of the Scene, and the thing a wiring edge lands on.
 */
export function addSceneVariable(
  sceneId: string,
  variable: SceneVariable,
  label = "Add Variable",
): ShowGraphCommand {
  return capturing<ShowGraph, null, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.addSceneVariable,
    label,
    scope: "selection",
    edits: [{ type: GRAPH_COMMAND_TYPES.addSceneVariable, sceneId, variable }],
    restoreEdits: () => [
      { type: GRAPH_COMMAND_TYPES.removeSceneVariable, sceneId, variableId: variable.id },
    ],
    capture: () => null,
    apply: (graph) => {
      const { scene } = sceneAt(graph, sceneId);
      return withVariables(graph, sceneId, [...scene.variables, { ...variable }]);
    },
    restore: (graph) => {
      const { scene } = sceneAt(graph, sceneId);
      return withVariables(
        graph,
        sceneId,
        scene.variables.filter((existing) => existing.id !== variable.id),
      );
    },
  });
}

/** Renames a Variable. Coalesced per gesture like any other typed edit (#28). */
export function renameSceneVariable(
  sceneId: string,
  variableId: string,
  name: string,
  label = "Rename Variable",
): ShowGraphCommand {
  return capturing<ShowGraph, string, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.renameSceneVariable,
    label,
    scope: "selection",
    coalesceKey: `${GRAPH_COMMAND_TYPES.renameSceneVariable}:${sceneId}:${variableId}`,
    edits: [{ type: GRAPH_COMMAND_TYPES.renameSceneVariable, sceneId, variableId, name }],
    restoreEdits: (captured) => [
      { type: GRAPH_COMMAND_TYPES.renameSceneVariable, sceneId, variableId, name: captured },
    ],
    capture: (graph) => {
      const { scene } = sceneAt(graph, sceneId);
      const variable = scene.variables.find((candidate) => candidate.id === variableId);
      if (!variable) throw new UnknownGraphTargetError("Variable", variableId);
      return variable.name;
    },
    isEmpty: (_graph, captured) => captured === name,
    apply: (graph) => renamed(graph, sceneId, variableId, name),
    restore: (graph, captured) => renamed(graph, sceneId, variableId, captured),
  });
}

function renamed(graph: ShowGraph, sceneId: string, variableId: string, name: string): ShowGraph {
  const { scene } = sceneAt(graph, sceneId);
  return withVariables(
    graph,
    sceneId,
    scene.variables.map((variable) =>
      variable.id === variableId ? { ...variable, name } : variable,
    ),
  );
}

function typesEqual(left: Type | null | undefined, right: Type | null | undefined): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

/** Sets a Variable's Type. Discrete like a color change, not coalesced per keystroke. */
export function setSceneVariableType(
  sceneId: string,
  variableId: string,
  type: Type | null,
  label = "Set Variable type",
): ShowGraphCommand {
  return capturing<ShowGraph, Type | null, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setSceneVariableType,
    label,
    scope: "selection",
    coalesceKey: `${GRAPH_COMMAND_TYPES.setSceneVariableType}:${sceneId}:${variableId}`,
    edits: [
      { type: GRAPH_COMMAND_TYPES.setSceneVariableType, sceneId, variableId, variableType: type },
    ],
    restoreEdits: (captured) => [
      {
        type: GRAPH_COMMAND_TYPES.setSceneVariableType,
        sceneId,
        variableId,
        variableType: captured,
      },
    ],
    capture: (graph) => {
      const { scene } = sceneAt(graph, sceneId);
      const variable = scene.variables.find((candidate) => candidate.id === variableId);
      if (!variable) throw new UnknownGraphTargetError("Variable", variableId);
      return variable.type ?? null;
    },
    isEmpty: (_graph, captured) => typesEqual(captured, type),
    apply: (graph) => typed(graph, sceneId, variableId, type),
    restore: (graph, captured) => typed(graph, sceneId, variableId, captured),
  });
}

function typed(
  graph: ShowGraph,
  sceneId: string,
  variableId: string,
  type: Type | null,
): ShowGraph {
  const { scene } = sceneAt(graph, sceneId);
  return withVariables(
    graph,
    sceneId,
    scene.variables.map((variable) => {
      if (variable.id !== variableId) return variable;
      const next = { ...variable };
      if (type === null) delete next.type;
      else next.type = type;
      if (next.type !== "image") delete next.suggestedDimensions;
      return next;
    }),
  );
}

/** Moves Scene Variables as one undoable, persisted ordering change. */
export function reorderSceneVariables(
  sceneId: string,
  variableIds: readonly string[],
  label = "Reorder Variables",
): ShowGraphCommand {
  return capturing<ShowGraph, SceneVariable[], GraphEdit>({
    type: GRAPH_COMMAND_TYPES.reorderSceneVariables,
    label,
    scope: "selection",
    edits: [
      { type: GRAPH_COMMAND_TYPES.reorderSceneVariables, sceneId, variableIds: [...variableIds] },
    ],
    restoreEdits: (captured) => [
      {
        type: GRAPH_COMMAND_TYPES.reorderSceneVariables,
        sceneId,
        variableIds: captured.map((variable) => variable.id),
      },
    ],
    capture: (graph) =>
      sceneAt(graph, sceneId).scene.variables.map((variable) => ({ ...variable })),
    isEmpty: (graph) => {
      const current = sceneAt(graph, sceneId).scene.variables.map((variable) => variable.id);
      return (
        current.length === variableIds.length &&
        current.every((id, index) => id === variableIds[index])
      );
    },
    apply: (graph) => reordered(graph, sceneId, variableIds),
    restore: (graph, captured) => withVariables(graph, sceneId, captured),
  });
}

function ordered(
  graph: ShowGraph,
  sceneId: string,
  variableIds: readonly string[],
): SceneVariable[] {
  const { scene } = sceneAt(graph, sceneId);
  return variableIds.map((variableId) => {
    const variable = scene.variables.find((candidate) => candidate.id === variableId);
    if (!variable) throw new UnknownGraphTargetError("Variable", variableId);
    return variable;
  });
}

function reordered(graph: ShowGraph, sceneId: string, variableIds: readonly string[]): ShowGraph {
  const { scene } = sceneAt(graph, sceneId);
  if (
    variableIds.length !== scene.variables.length ||
    new Set(variableIds).size !== scene.variables.length
  ) {
    throw new Error(
      `Variable order for Scene "${sceneId}" must contain every Variable exactly once.`,
    );
  }
  const variables = ordered(graph, sceneId, variableIds).map((variable, index) => ({
    ...variable,
    rank: variableRank(index),
  }));
  return withVariables(graph, sceneId, variables);
}

/** A removed Variable, and the wiring that fed it (#28). */
interface RemovedVariable {
  index: number;
  variable: SceneVariable;
  edges: { index: number; edge: GraphEdge }[];
}

/**
 * Removes a Variable from a Scene, taking any wiring edge that fed it — the
 * edge addresses the Variable by id (#20), so it can't outlive it. Both come
 * back on undo, at their original positions.
 */
export function removeSceneVariable(
  sceneId: string,
  variableId: string,
  label = "Delete Variable",
): ShowGraphCommand {
  return capturing<ShowGraph, RemovedVariable, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.removeSceneVariable,
    label,
    scope: "selection",
    edits: [{ type: GRAPH_COMMAND_TYPES.removeSceneVariable, sceneId, variableId }],
    // The Variable before the wiring that targets it, for the same reason a
    // restored node precedes its edges.
    restoreEdits: (captured) => [
      { type: GRAPH_COMMAND_TYPES.addSceneVariable, sceneId, variable: captured.variable },
      ...captured.edges.map(({ edge }) => ({ type: GRAPH_COMMAND_TYPES.addEdge, edge }) as const),
    ],
    capture: (graph) => {
      const { scene } = sceneAt(graph, sceneId);
      const index = scene.variables.findIndex((candidate) => candidate.id === variableId);
      if (index === -1) throw new UnknownGraphTargetError("Variable", variableId);
      return {
        index,
        variable: scene.variables[index] as SceneVariable,
        edges: graph.edges
          .map((edge, edgeIdx) => ({ index: edgeIdx, edge }))
          .filter(({ edge }) => edge.kind === "wiring" && edge.targetPath[0] === variableId),
      };
    },
    apply: (graph) => {
      const { scene } = sceneAt(graph, sceneId);
      const next = withVariables(
        graph,
        sceneId,
        scene.variables.filter((variable) => variable.id !== variableId),
      );
      return {
        ...next,
        edges: next.edges.filter(
          (edge) => !(edge.kind === "wiring" && edge.targetPath[0] === variableId),
        ),
      };
    },
    restore: (graph, captured) => {
      const { scene } = sceneAt(graph, sceneId);
      const variables = [...scene.variables];
      variables.splice(Math.min(captured.index, variables.length), 0, captured.variable);
      let next = withVariables(graph, sceneId, variables);
      for (const { index, edge } of captured.edges) {
        next = insertEdge(next, index, edge);
      }
      return next;
    },
  });
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

/** Adds an edge. Inverts to removing that edge (#28). */
export function addEdge(edge: GraphEdge, label = "Connect"): ShowGraphCommand {
  return capturing<ShowGraph, null, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.addEdge,
    label,
    edits: [{ type: GRAPH_COMMAND_TYPES.addEdge, edge }],
    restoreEdits: () => [{ type: GRAPH_COMMAND_TYPES.removeEdge, edgeId: edge.id }],
    // Edge creation is a canvas drag between handles, and the one accepted
    // keyboard exception in PRD §6.3.
    scope: "canvas",
    capture: () => null,
    apply: (graph) => ({ ...graph, edges: [...graph.edges, edge] }),
    restore: (graph) => ({
      ...graph,
      edges: graph.edges.filter((existing) => existing.id !== edge.id),
    }),
  });
}

/** Removes an edge, capturing it and its position in graph order (#28). */
export function removeEdge(edgeId: string, label = "Disconnect"): ShowGraphCommand {
  return capturing<ShowGraph, { index: number; edge: GraphEdge }, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.removeEdge,
    label,
    scope: "selection",
    edits: [{ type: GRAPH_COMMAND_TYPES.removeEdge, edgeId }],
    restoreEdits: (captured) => [{ type: GRAPH_COMMAND_TYPES.addEdge, edge: captured.edge }],
    capture: (graph) => {
      const index = edgeIndex(graph, edgeId);
      return { index, edge: graph.edges[index] as GraphEdge };
    },
    apply: (graph) => ({
      ...graph,
      edges: graph.edges.filter((edge) => edge.id !== edgeId),
    }),
    restore: (graph, captured) => insertEdge(graph, captured.index, captured.edge),
  });
}
