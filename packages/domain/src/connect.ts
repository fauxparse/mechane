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

import { assertValidShowGraph, deviceSourceType, findNode, InvalidShowGraphError } from "./graph";
import { fieldsForType, resolveShapeFieldMapping } from "./shapes";
import { typeAtPath } from "./property-values";
import type { EdgeKind, GraphEdge, GraphNode, ShowGraph } from "./graph";

/** A drag from one node's handle to another's, as the editor reports it. */
export interface ConnectionRequest {
  sourceId: string;
  targetId: string;
  /** The source handle, including a Device's virtual value handle. */
  sourceHandle?: string | null;
  /** The target handle React Flow reports for the drop. */
  targetHandle?: string | null;
  /**
   * The Scene Variable a wiring edge would feed. Wiring always lands on a
   * Variable (#20), so a drag that stops at the Scene body rather than one of
   * its Variable rows has nowhere to land, and says so. The node-level input
   * handle is the exception: it requests a new Variable.
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
  if (deviceSourceType(request.targetHandle) !== null) return null;
  const producer = findNode(graph, request.sourceId);
  const consumer = findNode(graph, request.targetId);
  if (!producer || !consumer) return null;
  const producesValue =
    producer.kind === "source" ||
    producer.kind === "transformer" ||
    (producer.kind === "device" && deviceSourceType(request.sourceHandle) !== null);
  if (consumer.kind === "device") return "device";
  if (consumer.kind === "source") return producesValue ? "wiring" : null;
  if (consumer.kind !== "scene" && consumer.kind !== "transformer") return null;
  if (producesValue) return "wiring";
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
  const producer = findNode(graph, request.sourceId);
  const virtualSourceType = deviceSourceType(request.sourceHandle);
  const sourcePath =
    virtualSourceType && request.sourceHandle
      ? [request.sourceHandle]
      : producer &&
          (producer.kind === "source" || producer.kind === "transformer") &&
          request.sourceHandle &&
          request.sourceHandle !== "out"
        ? [request.sourceHandle]
        : [];
  const base = {
    id,
    sourceId: request.sourceId,
    targetId: request.targetId,
    sourcePath,
  };
  switch (kind) {
    case "wiring": {
      const consumer = findNode(graph, request.targetId);
      if (consumer?.kind === "transformer") {
        const targetPath =
          request.targetHandle && request.targetHandle !== "in" ? [request.targetHandle] : [];
        return { ...base, kind: "wiring", targetPath };
      }
      if (consumer?.kind === "source") {
        return { ...base, kind: "wiring", targetPath: [] };
      }
      const variableId = request.targetVariableId;
      if (!variableId) return null;
      const target =
        consumer?.kind === "scene"
          ? consumer.variables.find((variable) => variable.id === variableId)
          : undefined;
      const producerType =
        producer?.kind === "source" || producer?.kind === "transformer"
          ? producer.type && sourcePath.length > 0
            ? typeAtPath(producer.type, sourcePath, graph.shapes ?? [])
            : producer.type
          : virtualSourceType;
      const fieldMapping =
        producerType && target?.type
          ? resolveShapeFieldMapping(producerType, target.type, graph.shapes ?? [])
          : undefined;
      return {
        ...base,
        kind: "wiring",
        targetPath: [variableId],
        ...(fieldMapping && Object.keys(fieldMapping).length > 0 ? { fieldMapping } : {}),
      };
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

/** React Flow's node-level input handle creates a new Scene Variable. */
const SCENE_INPUT_HANDLE = "in";
const CANDIDATE_VARIABLE_ID = "variable_candidate";

function implicitVariableType(graph: ShowGraph, request: ConnectionRequest) {
  const producer = findNode(graph, request.sourceId);
  const virtualSourceType = deviceSourceType(request.sourceHandle);
  return producer?.kind === "source" || producer?.kind === "transformer"
    ? producer.type
    : virtualSourceType;
}

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

  let candidateGraph = graph;
  let candidateRequest = request;
  if (
    kind === "wiring" &&
    consumer.kind === "scene" &&
    request.targetHandle === SCENE_INPUT_HANDLE &&
    !request.targetVariableId
  ) {
    const type = implicitVariableType(graph, request);
    if (!type) return "The source must have a Type to create a Variable.";
    let variableId = CANDIDATE_VARIABLE_ID;
    while (consumer.variables.some((variable) => variable.id === variableId)) {
      variableId = `${variableId}_`;
    }
    candidateGraph = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === consumer.id && node.kind === "scene"
          ? { ...node, variables: [...node.variables, { id: variableId, name: "variable", type }] }
          : node,
      ),
    };
    candidateRequest = { ...request, targetVariableId: variableId };
  }

  if (kind === "wiring" && consumer.kind === "scene" && !candidateRequest.targetVariableId) {
    return "Drop onto one of the Scene's Variables.";
  }

  const candidate = connectionEdge(candidateGraph, candidateRequest, CANDIDATE_EDGE_ID);
  if (!candidate) return `A ${producer.kind} can't connect to a ${consumer.kind}.`;
  try {
    const nodes =
      producer.parentId !== null &&
      producer.parentId !== undefined &&
      consumer.kind === "transformer" &&
      consumer.parentId === null
        ? candidateGraph.nodes.map((node) =>
            node.id === consumer.id
              ? ({ ...node, parentId: producer.parentId } as GraphNode)
              : node,
          )
        : candidateGraph.nodes;
    assertValidShowGraph({
      shapes: candidateGraph.shapes,
      nodes,
      edges: [...candidateGraph.edges, candidate],
    });
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
  if (reason.includes("more than one driver")) {
    return "That Device already has a driver.";
  }
  if (reason.includes("wiring edges form a cycle")) {
    return "Wiring can't form a cycle.";
  }
  return reason.replace(/^Invalid Show graph: /, "");
}
/**
 * Everything a drag from one node could legally land on.
 */
export interface ConnectionTargets {
  /** Nodes with at least one valid landing point. */
  nodeIds: Set<string>;
  /** Scene Variables that would accept the drag, across all Scenes. */
  variableIds: Set<string>;
  /** Shape fields that would accept the drag, across typed nodes. */
  fieldIds: Set<string>;
}
export function connectionTargets(
  graph: ShowGraph,
  sourceId: string,
  sourceHandle?: string | null,
): ConnectionTargets {
  const nodeIds = new Set<string>();
  const variableIds = new Set<string>();
  const fieldIds = new Set<string>();
  for (const node of graph.nodes) {
    if (node.kind === "scene") {
      let anyVariable = false;
      const rowsAreTargets =
        connectionKindFor(graph, { sourceId, sourceHandle, targetId: node.id }) === "wiring";
      for (const variable of rowsAreTargets ? node.variables : []) {
        if (
          canConnect(graph, {
            sourceId,
            sourceHandle,
            targetId: node.id,
            targetVariableId: variable.id,
          })
        ) {
          variableIds.add(variable.id);
          anyVariable = true;
        }
      }
      const sceneTargetable = canConnect(
        graph,
        rowsAreTargets
          ? { sourceId, sourceHandle, targetId: node.id, targetHandle: SCENE_INPUT_HANDLE }
          : { sourceId, sourceHandle, targetId: node.id },
      );
      if (anyVariable || sceneTargetable) nodeIds.add(node.id);
      continue;
    }
    if (node.kind === "transformer" && node.type) {
      const fields = fieldsForType(node.type, graph.shapes ?? []);
      for (const field of fields) {
        if (
          canConnect(graph, {
            sourceId,
            sourceHandle,
            targetId: node.id,
            targetHandle: field.id,
          })
        ) {
          fieldIds.add(field.id);
          nodeIds.add(node.id);
        }
      }
    }
    if (canConnect(graph, { sourceId, sourceHandle, targetId: node.id })) {
      nodeIds.add(node.id);
    }
  }
  return { nodeIds, variableIds, fieldIds };
}
