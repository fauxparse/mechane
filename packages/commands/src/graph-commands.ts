// The primitive Show-graph commands (issue #41), over @mechane/domain's
// `ShowGraph`.
//
// These are the *atoms*: add or remove one node, move one node, rename one
// node, add or remove one edge, add/rename/remove a Scene Variable, change a
// Flow's default Scene. The interaction slice (#42) composes them into the operations a director
// actually performs — a recursive Flow delete, a promote-into-Flow with its
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
  GraphEdge,
  GraphNode,
  Position,
  SceneNode,
  SceneVariable,
  ShowGraph,
} from "@mechane/domain";

import { capturing, composite } from "./command";
import type { Command } from "./command";

export type ShowGraphCommand = Command<ShowGraph>;

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
  addSceneVariable: "graph.addSceneVariable",
  renameSceneVariable: "graph.renameSceneVariable",
  removeSceneVariable: "graph.removeSceneVariable",
  promoteNode: "graph.promoteNode",
  extractNode: "graph.extractNode",
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
  return capturing<ShowGraph, null>({
    type: GRAPH_COMMAND_TYPES.addNode,
    label,
    // Creation needs the canvas, not a selection: it comes from a
    // right-click on empty space or a palette entry (#37, #42).
    scope: "canvas",
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
    commands.push(promoteNodes(graphWithFlow, nodeIds, flow.id, childOrigin));
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
 * pointer to it. Same principle as promote's auto-assignment, one order of
 * magnitude smaller.
 *
 * This removes *one* node. Nested Scenes inside a deleted Flow are the
 * cascade policy in #42 — composed from several of these, which is what
 * makes the cascade one undo entry.
 */
export function removeNode(nodeId: string, label?: string): ShowGraphCommand {
  return capturing<ShowGraph, RemovedNode>({
    type: GRAPH_COMMAND_TYPES.removeNode,
    label: label ?? "Delete",
    scope: "selection",
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
  return capturing<ShowGraph, Position>({
    type: GRAPH_COMMAND_TYPES.moveNode,
    label,
    scope: "selection",
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
  return capturing<ShowGraph, string>({
    type: GRAPH_COMMAND_TYPES.renameNode,
    label,
    scope: "selection",
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
 * promote and extract (#42). Position moves with it, because a Flow-local
 * node's position is relative to its Flow (#29) and keeping the old
 * coordinates would fling the node somewhere arbitrary.
 *
 * The *side effects* of a promote (auto-assigning the Flow's default Scene
 * when it was empty) are separate commands, composed with this one into a
 * single entry — see `setFlowDefaultScene` and #28.
 */
export function reparentNode(
  nodeId: string,
  parentId: string | null,
  position: Position,
  label = parentId === null ? "Extract" : "Promote",
): ShowGraphCommand {
  return capturing<ShowGraph, Placement>({
    type: GRAPH_COMMAND_TYPES.reparentNode,
    label,
    scope: "selection",
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
            "Moving a Scene between Flows is not allowed; extract it first.",
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
 * Promotes a top-level node into an empty or populated Flow. The default Scene
 * assignment is welded to membership, so one undo reverses both effects.
 */
export function promoteNode(
  graph: ShowGraph,
  nodeId: string,
  flowId: string,
  position: Position,
): ShowGraphCommand {
  return promoteNodes(graph, [nodeId], flowId, position);
}

/**
 * Promotes several top-level nodes as one command. Nodes are placed in a
 * column below the Flow's existing children, starting at `origin`; this keeps
 * the operation deterministic and prevents either existing or newly promoted
 * nodes from overlapping.
 */
export function promoteNodes(
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
      throw new InvalidReparentError("Flows and Devices cannot be promoted into a Flow.");
    }
    if (node.parentId !== null) {
      throw new InvalidReparentError("A node must be extracted before it can enter another Flow.");
    }
    return node;
  });
  if (nodes.length === 0) throw new InvalidReparentError("Select at least one node to promote.");

  const children = graph.nodes.filter((node) => node.parentId === flowId);
  let y = Math.max(origin.y, ...children.map((node) => node.position.y + nodeHeight(node) + 24));
  const parts: ShowGraphCommand[] = [];
  for (const node of nodes) {
    parts.push(reparentNode(node.id, flowId, { x: origin.x, y }, "Promote"));
    y += nodeHeight(node) + 24;
  }
  if (flow.defaultSceneId === null) {
    const firstScene = nodes.find((node) => node.kind === "scene");
    if (firstScene) parts.push(setFlowDefaultScene(flowId, firstScene.id));
  }
  return composite({ label: "Promote into Flow", commands: parts });
}

function nodeHeight(node: GraphNode): number {
  return node.kind === "scene" ? 56 + node.variables.length * 24 + 8 : 56;
}

/**
 * Extracts a node to Show level. Navigate edges are intentionally a hard
 * block: extraction preserves the Scene, so dangling state-machine edges
 * must be removed explicitly first. Wiring edges are disposable and are
 * removed as part of this command.
 */
export function extractNode(
  graph: ShowGraph,
  nodeId: string,
  position: Position,
): ShowGraphCommand {
  return extractNodes(graph, [nodeId], [position]);
}

/** Extracts several Flow-local nodes as one command. */
export function extractNodes(
  graph: ShowGraph,
  nodeIds: string[],
  positions: readonly Position[],
): ShowGraphCommand {
  if (nodeIds.length === 0 || nodeIds.length !== positions.length) {
    throw new InvalidReparentError("Select at least one Flow-local node to extract.");
  }

  const nodes = nodeIds.map((nodeId) => {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new UnknownGraphTargetError("node", nodeId);
    if (node.parentId === null) {
      throw new InvalidReparentError("Only Flow-local nodes can be extracted.");
    }
    const navigate = graph.edges.find(
      (edge) => edge.kind === "navigate" && (edge.sourceId === nodeId || edge.targetId === nodeId),
    );
    if (navigate) {
      throw new InvalidReparentError("Remove the Scene's Navigate edges before extracting it.");
    }
    return node;
  });

  const selected = new Set(nodeIds);
  const parts: ShowGraphCommand[] = graph.edges
    .filter(
      (edge) =>
        edge.kind === "wiring" && (selected.has(edge.sourceId) || selected.has(edge.targetId)),
    )
    .map((edge) => removeEdge(edge.id, "Remove wiring"));
  const defaultOwners = graph.nodes.filter(
    (node) =>
      node.kind === "flow" && node.defaultSceneId !== null && selected.has(node.defaultSceneId),
  );
  for (const owner of defaultOwners) parts.push(setFlowDefaultScene(owner.id, null));
  nodes.forEach((node, index) => {
    parts.push(reparentNode(node.id, null, positions[index]!, "Extract"));
  });
  return composite({ label: "Extract from Flow", commands: parts });
}

/**
 * Sets (or clears) a Flow's design-time entry Scene (#23). Small on its own;
 * its reason for existing is composition — a promote into an empty Flow
 * auto-assigns the default Scene, and that assignment must undo together
 * with the membership change (#28).
 */
export function setFlowDefaultScene(
  flowId: string,
  sceneId: string | null,
  label = "Set default Scene",
): ShowGraphCommand {
  return capturing<ShowGraph, string | null>({
    type: GRAPH_COMMAND_TYPES.setFlowDefaultScene,
    label,
    scope: "selection",
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
  return capturing<ShowGraph, null>({
    type: GRAPH_COMMAND_TYPES.addSceneVariable,
    label,
    scope: "selection",
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
  return capturing<ShowGraph, string>({
    type: GRAPH_COMMAND_TYPES.renameSceneVariable,
    label,
    scope: "selection",
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
  return capturing<ShowGraph, RemovedVariable>({
    type: GRAPH_COMMAND_TYPES.removeSceneVariable,
    label,
    scope: "selection",
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
  return capturing<ShowGraph, null>({
    type: GRAPH_COMMAND_TYPES.addEdge,
    label,
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
  return capturing<ShowGraph, { index: number; edge: GraphEdge }>({
    type: GRAPH_COMMAND_TYPES.removeEdge,
    label,
    scope: "selection",
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
