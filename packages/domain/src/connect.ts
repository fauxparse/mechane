// Which connections a handle-drag may make (issue #42, spec'd by #27).
//
// #38's `assertValidShowGraph` answers "is this whole graph well-formed?".
// The editor needs the same question asked one edge at a time, before the
// edge exists: what kind of edge would this drag make, may it be made, and
// if not, why not — the last one because #35's drag affordance dims what
// can't be dropped on, and the palette shows disabled commands *with a
// reason* (#37).
//
// So this module doesn't restate the rules. It builds the candidate edge and
// asks `assertValidShowGraph` about the graph that would result, which means
// there is exactly one place where "a Navigate edge stays inside its Flow"
// or "a Flow-local Source can't feed outside its Flow" is written down. A
// rule added there is enforced here for free.
//
// Connection rules are enforced by `assertValidShowGraph`, which this module
// uses on a candidate edge. That keeps persisted graphs and drag validation
// on the same seam.

import { assertValidShowGraph, findNode, InvalidShowGraphError } from "./graph";
import type { EdgeKind, GraphEdge, GraphNode, ShowGraph } from "./graph";

/** A drag from one node's handle to another's, as the editor reports it. */
export interface ConnectionRequest {
  sourceId: string;
  targetId: string;
  /**
   * The Scene Variable a wiring edge would feed. Wiring always lands on a
   * Variable (#20), so a drag that stops at the Scene's body rather than one
   * of its Variable rows has nowhere to land, and says so.
   */
  targetVariableId?: string | null;
}

/**
 * The kind of edge a connection between these two nodes would be, or null if
 * no kind of edge runs between them.
 *
 * Producer → consumer decides it (#20 as corrected by #26): the pair of node
 * kinds is enough, because no two kinds admit more than one edge kind
 * between them.
 */
export function connectionKindFor(graph: ShowGraph, request: ConnectionRequest): EdgeKind | null {
  const producer = findNode(graph, request.sourceId);
  const consumer = findNode(graph, request.targetId);
  if (!producer || !consumer) return null;
  if (consumer.kind === "device") return "device";
  if (consumer.kind !== "scene" && consumer.kind !== "transformer") return null;
  if (producer.kind === "source" || producer.kind === "transformer") return "wiring";
  if (producer.kind === "scene") return "navigate";
  return null;
}

/** The edge a connection would create, as it would be stored. */
export function connectionEdge(
  graph: ShowGraph,
  request: ConnectionRequest,
  id: string,
): GraphEdge | null {
  const kind = connectionKindFor(graph, request);
  if (kind === null) return null;
  const base = { id, sourceId: request.sourceId, targetId: request.targetId, sourcePath: [] };
  switch (kind) {
    case "wiring": {
      const consumer = findNode(graph, request.targetId);
      if (consumer?.kind === "transformer") {
        return { ...base, kind: "wiring", targetPath: [] };
      }
      const variableId = request.targetVariableId;
      if (!variableId) return null;
      return { ...base, kind: "wiring", targetPath: [variableId] };
    }
    case "navigate":
      // Cues and Actions aren't modelled yet (#20), so a hand-drawn Navigate
      // edge has no pairing to name — which is also what makes the second
      // one between the same two Scenes a duplicate for now.
      return { ...base, kind: "navigate", targetPath: [], cueId: null, actionId: null };
    case "device":
      return { ...base, kind: "device", targetPath: [] };
  }
}

/** Ids that can't collide with a real edge, since a candidate is never stored. */
const CANDIDATE_EDGE_ID = "edge_candidate";

/**
 * Why this connection can't be made, or null if it can — phrased for a
 * person, since it reaches the palette and the inspector rather than a log.
 */
export function connectionError(graph: ShowGraph, request: ConnectionRequest): string | null {
  if (request.sourceId === request.targetId) {
    const node = findNode(graph, request.sourceId);
    // A Scene may Navigate to itself (a "retry" transition, #24); nothing
    // else has a meaningful self-edge.
    if (!node || node.kind !== "scene") return "A node can't connect to itself.";
  }
  const producer = findNode(graph, request.sourceId);
  const consumer = findNode(graph, request.targetId);
  if (!producer || !consumer) return "That node isn't in this Show.";

  const kind = connectionKindFor(graph, request);
  if (kind === null) {
    return `A ${producer.kind} can't connect to a ${consumer.kind}.`;
  }
  if (
    kind === "wiring" &&
    findNode(graph, request.targetId)?.kind === "scene" &&
    !request.targetVariableId
  ) {
    return "Drop onto one of the Scene's Variables.";
  }

  const candidate = connectionEdge(graph, request, CANDIDATE_EDGE_ID);
  if (!candidate) return `A ${producer.kind} can't connect to a ${consumer.kind}.`;
  try {
    const producer = findNode(graph, request.sourceId);
    const consumer = findNode(graph, request.targetId);
    const nodes =
      producer?.parentId !== null &&
      producer?.parentId !== undefined &&
      consumer?.kind === "transformer" &&
      consumer.parentId === null
        ? graph.nodes.map((node) =>
            node.id === consumer.id
              ? ({ ...node, parentId: producer.parentId } as GraphNode)
              : node,
          )
        : graph.nodes;
    assertValidShowGraph({ nodes, edges: [...graph.edges, candidate] });
  } catch (error) {
    if (error instanceof InvalidShowGraphError) return humanise(error, kind);
    throw error;
  }
  return null;
}

/** Whether this connection may be made. */
export function canConnect(graph: ShowGraph, request: ConnectionRequest): boolean {
  return connectionError(graph, request) === null;
}

/**
 * The structural message, restated for a director. `InvalidShowGraphError`
 * talks about ids and well-formedness because it guards storage; a person
 * mid-drag wants to know what to do instead.
 */
function humanise(error: InvalidShowGraphError, kind: EdgeKind): string {
  const reason = error.message;
  if (reason.includes("duplicate")) {
    return kind === "navigate"
      ? "These Scenes are already connected."
      : "That connection already exists.";
  }
  if (reason.includes("same Flow")) {
    return "Navigate edges connect two Scenes in the same Flow.";
  }
  if (reason.includes("Flow-local")) {
    return "A Source inside a Flow can only feed nodes in that Flow.";
  }
  if (reason.includes("nested Scene is reached via its Flow")) {
    return "A Device is driven by a Flow or a top-level Scene, not by a Scene inside a Flow.";
  }
  if (reason.includes("overlapping paths")) {
    return "That Variable path is already connected.";
  }
  if (reason.includes("more than one driver")) {
    return "That Device already has a driver.";
  }
  if (reason.includes("wiring edges form a cycle")) {
    return "Wiring can't form a cycle.";
  }
  return reason.replace(/^Invalid Show graph: /, "");
}

/** Everything a drag from one node could legally land on. */
export interface ConnectionTargets {
  /** Nodes with at least one valid landing point. */
  nodeIds: Set<string>;
  /** Scene Variables that would accept the drag, across all Scenes. */
  variableIds: Set<string>;
}

/**
 * What a drag from `sourceId` may connect to, for #35's affordance: valid
 * targets get a dashed outline, everything else dims to 25%. Computed for
 * the whole graph at drag start rather than per hover, so the canvas can
 * answer "why can't I drop here" by showing where you can.
 */
export function connectionTargets(graph: ShowGraph, sourceId: string): ConnectionTargets {
  const nodeIds = new Set<string>();
  const variableIds = new Set<string>();
  for (const node of graph.nodes) {
    if (node.kind === "scene") {
      let anyVariable = false;
      // Only a wiring drag lands on a Variable row. A Navigate drag onto one
      // still connects the two Scenes (the row is part of the Scene), but the
      // row itself isn't the target, so it doesn't get the affordance.
      const rowsAreTargets = connectionKindFor(graph, { sourceId, targetId: node.id }) === "wiring";
      for (const variable of rowsAreTargets ? node.variables : []) {
        if (canConnect(graph, { sourceId, targetId: node.id, targetVariableId: variable.id })) {
          variableIds.add(variable.id);
          anyVariable = true;
        }
      }
      // A Navigate edge lands on the Scene itself rather than on a Variable,
      // so a Scene can be targetable with no targetable Variables.
      if (anyVariable || canConnect(graph, { sourceId, targetId: node.id })) nodeIds.add(node.id);
      continue;
    }
    if (canConnect(graph, { sourceId, targetId: node.id })) nodeIds.add(node.id);
  }
  return { nodeIds, variableIds };
}
