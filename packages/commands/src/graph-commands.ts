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
  EdgeLayout,
  Block,
  BlockVariable,
  DeviceNode,
  Element,
  FlowColor,
  GraphEdge,
  GraphNode,
  Position,
  SceneNode,
  SceneVariable,
  Shape,
  ShapeField,
  ShowGraph,
  SourceFieldDefault,
  Type,
} from "@mechane/domain";
import {
  BlockReferenceError,
  InvalidShapeError,
  assertShapeCanBeRemoved,
  assertShapeFieldNameAvailable,
  assertValidBlockName,
  assertValidShapeType,
  assertValidShapes,
  duplicateBlock as duplicateBlockResource,
  normalizeShapeCollectionInstances,
  renameBlock as renameBlockResource,
  shapeReferencesShape,
  typeAtPath,
} from "@mechane/domain";

import type { Command } from "./command";
import { capturing, composite } from "./command";
import type { GraphEdit } from "./graph-edits";
/** A command over the Show graph and its serialisable edit vocabulary. */
export type ShowGraphCommand = Command<ShowGraph, GraphEdit>;

/**
 * A command over a Show graph, which also knows how to say what it did on the
 * wire (#103) — see ./graph-edits for the vocabulary.
 */
export const GRAPH_COMMAND_TYPES = {
  addNode: "graph.addNode",
  removeNode: "graph.removeNode",
  moveNode: "graph.moveNode",
  renameNode: "graph.renameNode",
  reparentNode: "graph.reparentNode",
  addEdge: "graph.addEdge",
  removeEdge: "graph.removeEdge",
  setFlowDefaultScene: "graph.setFlowDefaultScene",
  setSourceType: "graph.setSourceType",
  setWiringFieldMapping: "graph.setWiringFieldMapping",
  setEdgeLayout: "graph.setEdgeLayout",
  setNodeColor: "graph.setNodeColor",
  setShapes: "graph.setShapes",
  addShape: "graph.addShape",
  renameShape: "graph.renameShape",
  duplicateShape: "graph.duplicateShape",
  removeShape: "graph.removeShape",
  addShapeField: "graph.addShapeField",
  renameShapeField: "graph.renameShapeField",
  setShapeFieldType: "graph.setShapeFieldType",
  setShapeFieldDefault: "graph.setShapeFieldDefault",
  setShapeFieldRequired: "graph.setShapeFieldRequired",
  reorderShapeFields: "graph.reorderShapeFields",
  removeShapeField: "graph.removeShapeField",
  setSourceFieldDefault: "graph.setSourceFieldDefault",
  addSceneVariable: "graph.addSceneVariable",
  renameSceneVariable: "graph.renameSceneVariable",
  setSceneVariableType: "graph.setSceneVariableType",
  setSceneVariableDefault: "graph.setSceneVariableDefault",
  reorderSceneVariables: "graph.reorderSceneVariables",
  removeSceneVariable: "graph.removeSceneVariable",
  setDevicePairingCode: "graph.setDevicePairingCode",
  setDevicePerConnection: "graph.setDevicePerConnection",
  setBlockVariables: "graph.setBlockVariables",
  addBlock: "graph.addBlock",
  renameBlock: "graph.renameBlock",
  duplicateBlock: "graph.duplicateBlock",
  removeBlock: "graph.removeBlock",
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

function replaceEdge(graph: ShowGraph, index: number, replacement: GraphEdge): ShowGraph {
  const edges = [...graph.edges];
  edges[index] = replacement;
  return { ...graph, edges };
}

function withSourceType(graph: ShowGraph, nodeId: string, type: Type): ShowGraph {
  const index = nodeIndex(graph, nodeId);
  const node = graph.nodes[index] as GraphNode;
  if (node.kind !== "source") throw new UnknownGraphTargetError("Source", nodeId);
  return replaceNode(graph, index, { ...node, type });
}

function withWiringFieldMapping(
  graph: ShowGraph,
  edgeId: string,
  fieldMapping: Record<string, string> | null,
): ShowGraph {
  const index = edgeIndex(graph, edgeId);
  const edge = graph.edges[index] as GraphEdge;
  if (edge.kind !== "wiring") throw new UnknownGraphTargetError("wiring edge", edgeId);
  const next = { ...edge };
  if (fieldMapping === null) delete next.fieldMapping;
  else next.fieldMapping = { ...fieldMapping };
  return replaceEdge(graph, index, next);
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
  /** Source defaults owned by this node, with their original positions. */
  sourceFieldDefaults: { index: number; value: SourceFieldDefault }[];
  /** Flows whose `defaultSceneId` pointed at this node and had to be cleared. */
  defaultSceneFlowIds: string[];
}

/**
 * Removes one node, the edges that touched it, its Source defaults, and any
 * Flow's reference to it as a default Scene — capturing all four, so the
 * inverse rebuilds it exactly (#28).
 *
 * The default-Scene clearing is the small case of #28's "side effects live
 * inside the snapshot": deleting a Flow's entry Scene has to leave the Flow
 * without one, and one undo has to bring back both the Scene and the Flow's
 * pointer to it. Source defaults follow the same rule; leaving one behind
 * would make the graph invalid at the persistence boundary.
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
        sourceFieldDefaults: (graph.sourceFieldDefaults ?? [])
          .map((value, defaultIdx) => ({ index: defaultIdx, value }))
          .filter(({ value }) => value.nodeId === nodeId),
        defaultSceneFlowIds: graph.nodes
          .filter((other) => other.kind === "flow" && other.defaultSceneId === nodeId)
          .map((other) => other.id),
      };
    },
    apply: (graph) => {
      const sourceFieldDefaults = (graph.sourceFieldDefaults ?? []).filter(
        (value) => value.nodeId !== nodeId,
      );
      return {
        ...graph,
        nodes: graph.nodes
          .filter((node) => node.id !== nodeId)
          .map((node) =>
            node.kind === "flow" && node.defaultSceneId === nodeId
              ? { ...node, defaultSceneId: null }
              : node,
          ),
        edges: graph.edges.filter((edge) => edge.sourceId !== nodeId && edge.targetId !== nodeId),
        ...(sourceFieldDefaults.length > 0
          ? { sourceFieldDefaults }
          : { sourceFieldDefaults: undefined }),
      };
    },
    restore: (graph, captured) => {
      let next = insertNode(graph, captured.index, captured.node);
      // Ascending indices, so each splice lands where it was: restoring the
      // earlier edge first keeps the later one's index meaningful.
      for (const { index, edge } of captured.edges) {
        next = insertEdge(next, index, edge);
      }
      if (captured.sourceFieldDefaults.length > 0) {
        const sourceFieldDefaults = [...(next.sourceFieldDefaults ?? [])];
        for (const { index, value } of captured.sourceFieldDefaults) {
          sourceFieldDefaults.splice(Math.min(index, sourceFieldDefaults.length), 0, value);
        }
        next = { ...next, sourceFieldDefaults };
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
/** Sets the required type of a Source node. */
export function setSourceType(
  nodeId: string,
  type: Type,
  label = "Change Source type",
): ShowGraphCommand {
  return capturing<ShowGraph, Type, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setSourceType,
    label,
    scope: "selection",
    coalesceKey: `${GRAPH_COMMAND_TYPES.setSourceType}:${nodeId}`,
    edits: [{ type: GRAPH_COMMAND_TYPES.setSourceType, nodeId, sourceType: type }],
    restoreEdits: (captured) => [
      { type: GRAPH_COMMAND_TYPES.setSourceType, nodeId, sourceType: captured },
    ],
    capture: (graph) => {
      const node = graph.nodes[nodeIndex(graph, nodeId)] as GraphNode;
      if (node.kind !== "source") throw new UnknownGraphTargetError("Source", nodeId);
      return node.type;
    },
    isEmpty: (graph) => {
      const node = graph.nodes[nodeIndex(graph, nodeId)] as GraphNode;
      return node.kind === "source" && JSON.stringify(node.type) === JSON.stringify(type);
    },
    apply: (graph) => withSourceType(graph, nodeId, type),
    restore: (graph, captured) => withSourceType(graph, nodeId, captured),
  });
}

/** Replaces a wiring edge's stable Shape field mapping. */
export function setWiringFieldMapping(
  edgeId: string,
  fieldMapping: Record<string, string> | null,
  label = "Update wiring fields",
): ShowGraphCommand {
  return capturing<ShowGraph, Record<string, string> | undefined, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setWiringFieldMapping,
    label,
    scope: "selection",
    edits: [{ type: GRAPH_COMMAND_TYPES.setWiringFieldMapping, edgeId, fieldMapping }],
    restoreEdits: (captured) => [
      {
        type: GRAPH_COMMAND_TYPES.setWiringFieldMapping,
        edgeId,
        fieldMapping: captured ?? null,
      },
    ],
    capture: (graph) => {
      const edge = graph.edges[edgeIndex(graph, edgeId)] as GraphEdge;
      if (edge.kind !== "wiring") throw new UnknownGraphTargetError("wiring edge", edgeId);
      return edge.fieldMapping ? { ...edge.fieldMapping } : undefined;
    },
    isEmpty: (graph) => {
      const edge = graph.edges[edgeIndex(graph, edgeId)] as GraphEdge;
      if (edge.kind !== "wiring") throw new UnknownGraphTargetError("wiring edge", edgeId);
      return JSON.stringify(edge.fieldMapping ?? null) === JSON.stringify(fieldMapping);
    },
    apply: (graph) => withWiringFieldMapping(graph, edgeId, fieldMapping),
    restore: (graph, captured) => withWiringFieldMapping(graph, edgeId, captured ?? null),
  });
}

/**
 * Records where the author has dragged an edge's runs (#475).
 *
 * One drag is one entry: the command coalesces on the edge, so a drag that
 * previews as it moves and commits on release leaves a single step to undo
 * rather than one per frame.
 */
export function setEdgeLayout(
  edgeId: string,
  layout: EdgeLayout | null,
  label = "Move edge",
): ShowGraphCommand {
  return capturing<ShowGraph, EdgeLayout | undefined, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setEdgeLayout,
    label,
    scope: "selection",
    coalesceKey: `${GRAPH_COMMAND_TYPES.setEdgeLayout}:${edgeId}`,
    edits: [{ type: GRAPH_COMMAND_TYPES.setEdgeLayout, edgeId, layout }],
    restoreEdits: (captured) => [
      { type: GRAPH_COMMAND_TYPES.setEdgeLayout, edgeId, layout: captured ?? null },
    ],
    capture: (graph) => {
      const edge = graph.edges[edgeIndex(graph, edgeId)] as GraphEdge;
      return edge.layout ? structuredClone(edge.layout) : undefined;
    },
    isEmpty: (graph) => {
      const edge = graph.edges[edgeIndex(graph, edgeId)] as GraphEdge;
      return JSON.stringify(edge.layout ?? null) === JSON.stringify(layout);
    },
    apply: (graph) => withEdgeLayout(graph, edgeId, layout),
    restore: (graph, captured) => withEdgeLayout(graph, edgeId, captured ?? null),
  });
}

function withEdgeLayout(graph: ShowGraph, edgeId: string, layout: EdgeLayout | null): ShowGraph {
  const index = edgeIndex(graph, edgeId);
  const edge = graph.edges[index] as GraphEdge;
  const next = { ...edge };
  // An edge with every nudge dragged back to nothing is an edge with no
  // layout, not one carrying an empty record around forever.
  if (layout === null || Object.keys(layout).length === 0) delete next.layout;
  else next.layout = structuredClone(layout);
  return replaceEdge(graph, index, next);
}

/** Sets or clears one graph-owned Source value override. */
export function setSourceFieldDefault(
  nodeId: string,
  fieldPath: readonly string[],
  value: unknown,
  label = "Set Source value",
): ShowGraphCommand {
  const path = [...fieldPath];
  return capturing<ShowGraph, SourceFieldDefault | undefined, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setSourceFieldDefault,
    label,
    scope: "selection",
    coalesceKey: `${GRAPH_COMMAND_TYPES.setSourceFieldDefault}:${nodeId}:${path.join(".")}`,
    edits: [{ type: GRAPH_COMMAND_TYPES.setSourceFieldDefault, nodeId, fieldPath: path, value }],
    restoreEdits: (captured) => [
      {
        type: GRAPH_COMMAND_TYPES.setSourceFieldDefault,
        nodeId,
        fieldPath: path,
        value: captured?.value ?? null,
      },
    ],
    capture: (graph) =>
      graph.sourceFieldDefaults?.find(
        (override) => override.nodeId === nodeId && samePath(override.fieldPath, path),
      ),
    isEmpty: (graph) => {
      const current = graph.sourceFieldDefaults?.find(
        (override) => override.nodeId === nodeId && samePath(override.fieldPath, path),
      );
      return value === null
        ? current === undefined
        : current !== undefined && JSON.stringify(current.value) === JSON.stringify(value);
    },
    apply: (graph) => withSourceFieldDefault(graph, nodeId, path, value),
    restore: (graph, captured) =>
      withSourceFieldDefault(graph, nodeId, path, captured?.value ?? null),
  });
}

function withSourceFieldDefault(
  graph: ShowGraph,
  nodeId: string,
  fieldPath: readonly string[],
  value: unknown,
): ShowGraph {
  const remaining = (graph.sourceFieldDefaults ?? []).filter(
    (override) => !(override.nodeId === nodeId && samePath(override.fieldPath, fieldPath)),
  );
  const source = graph.nodes.find((node) => node.id === nodeId);
  const sourceType =
    source?.kind === "source" ? typeAtPath(source.type, fieldPath, graph.shapes ?? []) : null;
  const normalizedValue =
    value === null || sourceType === null || sourceType === undefined
      ? value
      : normalizeShapeCollectionInstances(value, sourceType, graph.shapes ?? []);
  const next =
    normalizedValue === null
      ? remaining
      : [...remaining, { nodeId, fieldPath: [...fieldPath], value: normalizedValue }];
  return next.length > 0
    ? { ...graph, sourceFieldDefaults: next }
    : { ...graph, sourceFieldDefaults: undefined };
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
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
function shapesOf(graph: ShowGraph): Shape[] {
  return graph.shapes ?? [];
}

function shapeAt(graph: ShowGraph, shapeId: string): { index: number; shape: Shape } {
  const shapes = shapesOf(graph);
  const index = shapes.findIndex((shape) => shape.id === shapeId);
  if (index === -1) throw new UnknownGraphTargetError("Shape", shapeId);
  return { index, shape: shapes[index] as Shape };
}

function shapeFieldAt(
  graph: ShowGraph,
  shapeId: string,
  fieldId: string,
): { shapeIndex: number; fieldIndex: number; shape: Shape; field: ShapeField } {
  const { index: shapeIndex, shape } = shapeAt(graph, shapeId);
  const fieldIndex = shape.fields.findIndex((field) => field.id === fieldId);
  if (fieldIndex === -1) throw new UnknownGraphTargetError("Shape Field", fieldId);
  return { shapeIndex, fieldIndex, shape, field: shape.fields[fieldIndex] as ShapeField };
}

function withShapes(graph: ShowGraph, shapes: Shape[]): ShowGraph {
  return { ...graph, shapes };
}

function replaceShape(
  graph: ShowGraph,
  shapeId: string,
  update: (shape: Shape) => Shape,
): ShowGraph {
  const { index } = shapeAt(graph, shapeId);
  const shapes = shapesOf(graph).slice();
  shapes[index] = update(shapes[index] as Shape);
  return withShapes(graph, shapes);
}

function replaceShapeField(
  graph: ShowGraph,
  shapeId: string,
  fieldId: string,
  update: (field: ShapeField) => ShapeField,
): ShowGraph {
  return replaceShape(graph, shapeId, (shape) => ({
    ...shape,
    fields: shape.fields.map((field) => (field.id === fieldId ? update(field) : field)),
  }));
}

function assertShapeTypeChange(
  graph: ShowGraph,
  shapeId: string,
  fieldId: string,
  type: Type,
): void {
  const shapes = shapesOf(graph);
  assertValidShapeType(type, shapes, `Field ${fieldId}`);
  const next = replaceShapeField(graph, shapeId, fieldId, (field) => ({ ...field, type }));
  if (shapeReferencesShape(next.shapes ?? [], shapeId, shapeId)) {
    throw new InvalidShapeError("Shape references must be acyclic.");
  }
}

function shapeFieldOrder(
  graph: ShowGraph,
  shapeId: string,
  fieldIds: readonly string[],
): ShapeField[] {
  const { shape } = shapeAt(graph, shapeId);
  if (fieldIds.length !== shape.fields.length || new Set(fieldIds).size !== shape.fields.length) {
    throw new InvalidShapeError(
      `Field order for Shape "${shapeId}" must contain every Field exactly once.`,
    );
  }
  return fieldIds.map((fieldId) => {
    const field = shape.fields.find((candidate) => candidate.id === fieldId);
    if (!field) throw new UnknownGraphTargetError("Shape Field", fieldId);
    return field;
  });
}

/** Adds one Show-scoped Shape definition. */
export function addShape(shape: Shape, label = "Add Shape"): ShowGraphCommand {
  return capturing<ShowGraph, null, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.addShape,
    label,
    scope: "global",
    edits: [{ type: GRAPH_COMMAND_TYPES.addShape, shape }],
    restoreEdits: () => [{ type: GRAPH_COMMAND_TYPES.removeShape, shapeId: shape.id }],
    capture: () => null,
    apply: (graph) => {
      const shapes = [...shapesOf(graph), shape];
      assertValidShapes(shapes);
      return withShapes(graph, shapes);
    },
    restore: (graph) =>
      withShapes(
        graph,
        shapesOf(graph).filter((candidate) => candidate.id !== shape.id),
      ),
  });
}

/** Renames a Shape. */
export function renameShape(
  shapeId: string,
  name: string,
  label = "Rename Shape",
): ShowGraphCommand {
  return capturing<ShowGraph, string, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.renameShape,
    label,
    scope: "selection",
    coalesceKey: `${GRAPH_COMMAND_TYPES.renameShape}:${shapeId}`,
    edits: [{ type: GRAPH_COMMAND_TYPES.renameShape, shapeId, name }],
    restoreEdits: (captured) => [
      { type: GRAPH_COMMAND_TYPES.renameShape, shapeId, name: captured },
    ],
    capture: (graph) => shapeAt(graph, shapeId).shape.name,
    isEmpty: (_graph, captured) => captured === name,
    apply: (graph) => replaceShape(graph, shapeId, (shape) => ({ ...shape, name })),
    restore: (graph, captured) =>
      replaceShape(graph, shapeId, (shape) => ({ ...shape, name: captured })),
  });
}

/** Adds a materialised duplicate Shape with its own undoable edit. */
export function duplicateShape(shape: Shape, label = "Duplicate Shape"): ShowGraphCommand {
  return capturing<ShowGraph, null, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.duplicateShape,
    label,
    scope: "global",
    edits: [{ type: GRAPH_COMMAND_TYPES.duplicateShape, shape }],
    restoreEdits: () => [{ type: GRAPH_COMMAND_TYPES.removeShape, shapeId: shape.id }],
    capture: () => null,
    apply: (graph) => {
      const shapes = [...shapesOf(graph), shape];
      assertValidShapes(shapes);
      return withShapes(graph, shapes);
    },
    restore: (graph) =>
      withShapes(
        graph,
        shapesOf(graph).filter((candidate) => candidate.id !== shape.id),
      ),
  });
}

/** Removes a Shape, refusing definitions still referenced by another Shape. */
export function removeShape(shapeId: string, label = "Delete Shape"): ShowGraphCommand {
  return capturing<ShowGraph, { index: number; shape: Shape }, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.removeShape,
    label,
    scope: "selection",
    edits: [{ type: GRAPH_COMMAND_TYPES.removeShape, shapeId }],
    restoreEdits: (captured) => [{ type: GRAPH_COMMAND_TYPES.addShape, shape: captured.shape }],
    capture: (graph) => {
      const { index, shape } = shapeAt(graph, shapeId);
      assertShapeCanBeRemoved(shapesOf(graph), shapeId);
      return { index, shape };
    },
    apply: (graph) =>
      withShapes(
        graph,
        shapesOf(graph).filter((shape) => shape.id !== shapeId),
      ),
    restore: (graph, captured) => {
      const shapes = shapesOf(graph).slice();
      shapes.splice(Math.min(captured.index, shapes.length), 0, captured.shape);
      return withShapes(graph, shapes);
    },
  });
}

/** Adds a Field to a Shape. */
export function addShapeField(
  shapeId: string,
  field: ShapeField,
  label = "Add Field",
): ShowGraphCommand {
  return capturing<ShowGraph, null, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.addShapeField,
    label,
    scope: "selection",
    edits: [{ type: GRAPH_COMMAND_TYPES.addShapeField, shapeId, field }],
    restoreEdits: () => [
      { type: GRAPH_COMMAND_TYPES.removeShapeField, shapeId, fieldId: field.id },
    ],
    capture: () => null,
    apply: (graph) => {
      const { shape } = shapeAt(graph, shapeId);
      assertShapeFieldNameAvailable(shape, field.name);
      assertValidShapeType(field.type, shapesOf(graph), `Field ${field.name}`);
      const next = replaceShape(graph, shapeId, (current) => ({
        ...current,
        fields: [...current.fields, field],
      }));
      if (shapeReferencesShape(next.shapes ?? [], shapeId, shapeId)) {
        throw new InvalidShapeError("Shape references must be acyclic.");
      }
      return next;
    },
    restore: (graph) =>
      replaceShape(graph, shapeId, (shape) => ({
        ...shape,
        fields: shape.fields.filter((candidate) => candidate.id !== field.id),
      })),
  });
}

/** Renames a Field, keeping names unique within its Shape. */
export function renameShapeField(
  shapeId: string,
  fieldId: string,
  name: string,
  label = "Rename Field",
): ShowGraphCommand {
  return capturing<ShowGraph, string, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.renameShapeField,
    label,
    scope: "selection",
    coalesceKey: `${GRAPH_COMMAND_TYPES.renameShapeField}:${shapeId}:${fieldId}`,
    edits: [{ type: GRAPH_COMMAND_TYPES.renameShapeField, shapeId, fieldId, name }],
    restoreEdits: (captured) => [
      { type: GRAPH_COMMAND_TYPES.renameShapeField, shapeId, fieldId, name: captured },
    ],
    capture: (graph) => shapeFieldAt(graph, shapeId, fieldId).field.name,
    isEmpty: (_graph, captured) => captured === name,
    apply: (graph) => {
      const { shape } = shapeFieldAt(graph, shapeId, fieldId);
      assertShapeFieldNameAvailable(shape, name, fieldId);
      return replaceShapeField(graph, shapeId, fieldId, (field) => ({ ...field, name }));
    },
    restore: (graph, captured) =>
      replaceShapeField(graph, shapeId, fieldId, (field) => ({ ...field, name: captured })),
  });
}

/** Sets a Field's Type, rejecting unknown references and cycles. */
export function setShapeFieldType(
  shapeId: string,
  fieldId: string,
  type: Type,
  label = "Set Field type",
): ShowGraphCommand {
  return capturing<ShowGraph, Type, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setShapeFieldType,
    label,
    scope: "selection",
    coalesceKey: `${GRAPH_COMMAND_TYPES.setShapeFieldType}:${shapeId}:${fieldId}`,
    edits: [{ type: GRAPH_COMMAND_TYPES.setShapeFieldType, shapeId, fieldId, fieldType: type }],
    restoreEdits: (captured) => [
      { type: GRAPH_COMMAND_TYPES.setShapeFieldType, shapeId, fieldId, fieldType: captured },
    ],
    capture: (graph) => shapeFieldAt(graph, shapeId, fieldId).field.type,
    isEmpty: (graph, captured) => JSON.stringify(captured) === JSON.stringify(type),
    apply: (graph) => {
      assertShapeTypeChange(graph, shapeId, fieldId, type);
      return replaceShapeField(graph, shapeId, fieldId, (field) => ({ ...field, type }));
    },
    restore: (graph, captured) =>
      replaceShapeField(graph, shapeId, fieldId, (field) => ({ ...field, type: captured })),
  });
}

/** Sets a Field's default value. */
export function setShapeFieldDefault(
  shapeId: string,
  fieldId: string,
  defaultValue: unknown,
  label = "Set Field default",
): ShowGraphCommand {
  return capturing<ShowGraph, unknown, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setShapeFieldDefault,
    label,
    scope: "selection",
    coalesceKey: `${GRAPH_COMMAND_TYPES.setShapeFieldDefault}:${shapeId}:${fieldId}`,
    edits: [{ type: GRAPH_COMMAND_TYPES.setShapeFieldDefault, shapeId, fieldId, defaultValue }],
    restoreEdits: (captured) => [
      { type: GRAPH_COMMAND_TYPES.setShapeFieldDefault, shapeId, fieldId, defaultValue: captured },
    ],
    capture: (graph) => shapeFieldAt(graph, shapeId, fieldId).field.defaultValue,
    isEmpty: (_graph, captured) => JSON.stringify(captured) === JSON.stringify(defaultValue),
    apply: (graph) =>
      replaceShapeField(graph, shapeId, fieldId, (field) => ({ ...field, defaultValue })),
    restore: (graph, captured) =>
      replaceShapeField(graph, shapeId, fieldId, (field) => ({ ...field, defaultValue: captured })),
  });
}

/** Sets whether a Field is required. */
export function setShapeFieldRequired(
  shapeId: string,
  fieldId: string,
  required: boolean,
  label = "Set Field required",
): ShowGraphCommand {
  return capturing<ShowGraph, boolean, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setShapeFieldRequired,
    label,
    scope: "selection",
    coalesceKey: `${GRAPH_COMMAND_TYPES.setShapeFieldRequired}:${shapeId}:${fieldId}`,
    edits: [{ type: GRAPH_COMMAND_TYPES.setShapeFieldRequired, shapeId, fieldId, required }],
    restoreEdits: (captured) => [
      { type: GRAPH_COMMAND_TYPES.setShapeFieldRequired, shapeId, fieldId, required: captured },
    ],
    capture: (graph) => shapeFieldAt(graph, shapeId, fieldId).field.required,
    isEmpty: (_graph, captured) => captured === required,
    apply: (graph) =>
      replaceShapeField(graph, shapeId, fieldId, (field) => ({ ...field, required })),
    restore: (graph, captured) =>
      replaceShapeField(graph, shapeId, fieldId, (field) => ({ ...field, required: captured })),
  });
}

/** Reorders the Fields of a Shape. */
export function reorderShapeFields(
  shapeId: string,
  fieldIds: readonly string[],
  label = "Reorder Fields",
): ShowGraphCommand {
  return capturing<ShowGraph, ShapeField[], GraphEdit>({
    type: GRAPH_COMMAND_TYPES.reorderShapeFields,
    label,
    scope: "selection",
    edits: [{ type: GRAPH_COMMAND_TYPES.reorderShapeFields, shapeId, fieldIds: [...fieldIds] }],
    restoreEdits: (captured) => [
      {
        type: GRAPH_COMMAND_TYPES.reorderShapeFields,
        shapeId,
        fieldIds: captured.map((field) => field.id),
      },
    ],
    capture: (graph) => shapeAt(graph, shapeId).shape.fields.map((field) => ({ ...field })),
    isEmpty: (graph) => {
      const current = shapeAt(graph, shapeId).shape.fields.map((field) => field.id);
      return (
        current.length === fieldIds.length && current.every((id, index) => id === fieldIds[index])
      );
    },
    apply: (graph) =>
      replaceShape(graph, shapeId, (shape) => ({
        ...shape,
        fields: shapeFieldOrder(graph, shapeId, fieldIds),
      })),
    restore: (graph, captured) =>
      replaceShape(graph, shapeId, (shape) => ({ ...shape, fields: captured })),
  });
}

/** Removes a Field from a Shape. */
export function removeShapeField(
  shapeId: string,
  fieldId: string,
  label = "Delete Field",
): ShowGraphCommand {
  return capturing<ShowGraph, { index: number; field: ShapeField }, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.removeShapeField,
    label,
    scope: "selection",
    edits: [{ type: GRAPH_COMMAND_TYPES.removeShapeField, shapeId, fieldId }],
    restoreEdits: (captured) => [
      { type: GRAPH_COMMAND_TYPES.addShapeField, shapeId, field: captured.field },
    ],
    capture: (graph) => {
      const { fieldIndex, field } = shapeFieldAt(graph, shapeId, fieldId);
      return { index: fieldIndex, field };
    },
    apply: (graph) =>
      replaceShape(graph, shapeId, (shape) => ({
        ...shape,
        fields: shape.fields.filter((field) => field.id !== fieldId),
      })),
    restore: (graph, captured) =>
      replaceShape(graph, shapeId, (shape) => {
        const fields = shape.fields.slice();
        fields.splice(Math.min(captured.index, fields.length), 0, captured.field);
        return { ...shape, fields };
      }),
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
/** Sets a Scene Variable's optional literal default. */
export function setSceneVariableDefault(
  sceneId: string,
  variableId: string,
  defaultValue: unknown,
  label = "Set Variable Default",
): ShowGraphCommand {
  return capturing<ShowGraph, unknown, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setSceneVariableDefault,
    label,
    scope: "selection",
    edits: [
      { type: GRAPH_COMMAND_TYPES.setSceneVariableDefault, sceneId, variableId, defaultValue },
    ],
    restoreEdits: (captured) => [
      {
        type: GRAPH_COMMAND_TYPES.setSceneVariableDefault,
        sceneId,
        variableId,
        defaultValue: captured,
      },
    ],
    capture: (graph) => {
      const { scene } = sceneAt(graph, sceneId);
      const variable = scene.variables.find((candidate) => candidate.id === variableId);
      if (!variable) throw new UnknownGraphTargetError("Variable", variableId);
      return variable.defaultValue ?? null;
    },
    isEmpty: (_graph, captured) => JSON.stringify(captured) === JSON.stringify(defaultValue),
    apply: (graph) => updateSceneVariableDefault(graph, sceneId, variableId, defaultValue),
    restore: (graph, captured) => updateSceneVariableDefault(graph, sceneId, variableId, captured),
  });
}

function updateSceneVariableDefault(
  graph: ShowGraph,
  sceneId: string,
  variableId: string,
  defaultValue: unknown,
): ShowGraph {
  const { scene } = sceneAt(graph, sceneId);
  return withVariables(
    graph,
    sceneId,
    scene.variables.map((variable) => {
      if (variable.id !== variableId) return variable;
      const next = { ...variable };
      if (defaultValue === null || defaultValue === undefined) delete next.defaultValue;
      else next.defaultValue = defaultValue;
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
// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function blockAt(graph: ShowGraph, blockId: string): { index: number; block: Block } {
  const index = (graph.blocks ?? []).findIndex((block) => block.id === blockId);
  const block = graph.blocks?.[index];
  if (index < 0 || !block) throw new UnknownGraphTargetError("Block", blockId);
  return { index, block };
}

function withBlocks(graph: ShowGraph, blocks: readonly Block[]): ShowGraph {
  return { ...graph, blocks: [...blocks] };
}

function elementReferencesBlock(element: Element, blockId: string): boolean {
  if ("blockId" in element && element.blockId === blockId) return true;
  return (element.children ?? []).some((child) => elementReferencesBlock(child, blockId));
}

function blockIsReferenced(graph: ShowGraph, blockId: string): boolean {
  return (graph.blocks ?? []).some((block) => elementReferencesBlock(block.canvas.root, blockId));
}

export function addBlock(block: Block, label = "Add Block"): ShowGraphCommand {
  return capturing<ShowGraph, null, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.addBlock,
    label,
    scope: "global",
    edits: [{ type: GRAPH_COMMAND_TYPES.addBlock, block }],
    restoreEdits: () => [{ type: GRAPH_COMMAND_TYPES.removeBlock, blockId: block.id }],
    capture: () => null,
    apply: (graph) => {
      const blocks = graph.blocks ?? [];
      if (blocks.some((candidate) => candidate.id === block.id)) {
        throw new UnknownGraphTargetError("unique Block", block.id);
      }
      if (blocks.some((candidate) => candidate.name === block.name)) {
        throw new InvalidShapeError(`Block name "${block.name}" is already in use.`);
      }
      return withBlocks(graph, [...blocks, block]);
    },
    restore: (graph) =>
      withBlocks(
        graph,
        (graph.blocks ?? []).filter((candidate) => candidate.id !== block.id),
      ),
  });
}
export function renameBlock(
  blockId: string,
  name: string,
  label = "Rename Block",
): ShowGraphCommand {
  const nextName = assertValidBlockName(name);
  return capturing<ShowGraph, string, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.renameBlock,
    label,
    scope: "global",
    edits: [{ type: GRAPH_COMMAND_TYPES.renameBlock, blockId, name: nextName }],
    restoreEdits: (captured) => [
      { type: GRAPH_COMMAND_TYPES.renameBlock, blockId, name: captured },
    ],
    capture: (graph) => blockAt(graph, blockId).block.name,
    isEmpty: (_graph, captured) => captured === nextName,
    apply: (graph) => {
      const { block: current } = blockAt(graph, blockId);
      const other = (graph.blocks ?? []).find(
        (candidate) => candidate.id !== current.id && candidate.name === nextName,
      );
      if (other) throw new InvalidShapeError(`Block name "${nextName}" is already in use.`);
      return withBlocks(
        graph,
        (graph.blocks ?? []).map((candidate) =>
          candidate.id === blockId ? renameBlockResource(candidate, nextName) : candidate,
        ),
      );
    },
    restore: (graph, previous) =>
      withBlocks(
        graph,
        (graph.blocks ?? []).map((candidate) =>
          candidate.id === blockId ? renameBlockResource(candidate, previous) : candidate,
        ),
      ),
  });
}
export function duplicateBlock(
  block: Block,
  name: string,
  label = "Duplicate Block",
): ShowGraphCommand {
  const nextName = assertValidBlockName(name);
  const duplicate = duplicateBlockResource(block, nextName);
  return capturing<ShowGraph, null, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.duplicateBlock,
    label,
    scope: "global",
    edits: [{ type: GRAPH_COMMAND_TYPES.duplicateBlock, block: duplicate }],
    restoreEdits: () => [{ type: GRAPH_COMMAND_TYPES.removeBlock, blockId: duplicate.id }],
    capture: () => null,
    apply: (graph) => {
      if ((graph.blocks ?? []).some((candidate) => candidate.name === nextName)) {
        throw new InvalidShapeError(`Block name "${nextName}" is already in use.`);
      }
      return withBlocks(graph, [...(graph.blocks ?? []), duplicate]);
    },
    restore: (graph) =>
      withBlocks(
        graph,
        (graph.blocks ?? []).filter((candidate) => candidate.id !== duplicate.id),
      ),
  });
}
export function removeBlock(blockId: string, label = "Delete Block"): ShowGraphCommand {
  return capturing<ShowGraph, { index: number; block: Block }, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.removeBlock,
    label,
    scope: "global",
    edits: [{ type: GRAPH_COMMAND_TYPES.removeBlock, blockId }],
    restoreEdits: (captured) => [{ type: GRAPH_COMMAND_TYPES.addBlock, block: captured.block }],
    capture: (graph) => {
      const captured = blockAt(graph, blockId);
      if (blockIsReferenced(graph, blockId)) throw new BlockReferenceError(blockId);
      return captured;
    },
    apply: (graph) =>
      withBlocks(
        graph,
        (graph.blocks ?? []).filter((candidate) => candidate.id !== blockId),
      ),
    restore: (graph, captured) => {
      const blocks = graph.blocks?.slice() ?? [];
      blocks.splice(Math.min(captured.index, blocks.length), 0, captured.block);
      return withBlocks(graph, blocks);
    },
  });
}
export function setBlockVariables(
  blockId: string,
  variables: readonly BlockVariable[],
  label = "Edit Block Variables",
): ShowGraphCommand {
  return capturing<ShowGraph, BlockVariable[], GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setBlockVariables,
    label,
    scope: "selection",
    edits: [{ type: GRAPH_COMMAND_TYPES.setBlockVariables, blockId, variables: [...variables] }],
    restoreEdits: (captured) => [
      { type: GRAPH_COMMAND_TYPES.setBlockVariables, blockId, variables: captured },
    ],
    capture: (graph) =>
      blockAt(graph, blockId).block.variables.map((variable) => ({ ...variable })),
    isEmpty: (graph) =>
      JSON.stringify(blockAt(graph, blockId).block.variables) === JSON.stringify(variables),
    apply: (graph) =>
      withBlocks(
        graph,
        (graph.blocks ?? []).map((block) =>
          block.id === blockId ? { ...block, variables: [...variables] } : block,
        ),
      ),
    restore: (graph, captured) =>
      withBlocks(
        graph,
        (graph.blocks ?? []).map((block) =>
          block.id === blockId ? { ...block, variables: captured } : block,
        ),
      ),
  });
}
