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
import { defaultSourceValues } from "./source-defaults";
import { fieldsForType, resolveShapeFieldMapping, type Type } from "./shapes";
import { typeAtPath, valueAtPath } from "./property-values";
import type { EdgeKind, GraphEdge, GraphNode, SceneVariable, ShowGraph } from "./graph";
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
 * Resolves the value type exposed by a producer handle.
 *
 * Shape field handles expose the field type; the node's `type` is used only
 * for its whole-node output.
 */
export function sourceTypeAtHandle(
  graph: ShowGraph,
  sourceId: string,
  sourceHandle?: string | null,
): Type | null {
  const producer = findNode(graph, sourceId);
  const virtualSourceType = deviceSourceType(sourceHandle);
  if (virtualSourceType) return virtualSourceType;
  if (producer?.kind !== "source" && producer?.kind !== "transformer") return null;
  if (!producer.type) return null;
  if (sourceHandle && sourceHandle !== "out") {
    return typeAtPath(producer.type, [sourceHandle], graph.shapes ?? []);
  }
  return producer.type;
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
      const producerType = sourceTypeAtHandle(graph, request.sourceId, request.sourceHandle);
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

/** React Flow's node-level input handle creates a new Scene Variable. */
const SCENE_INPUT_HANDLE = "in";

/** IDs supplied by the editor for the edits a landed connection will emit. */
export interface ConnectionIds {
  edgeId: string;
  variableId: string;
}

/**
 * The small subset of graph edits a connection can plan. The shape is
 * intentionally the same as `@mechane/commands`' GraphEdit union without
 * making the domain depend on the command layer.
 *
 * A plan may also include a node that the editor is creating at the end of
 * the drag. Validation then sees the new endpoint before the edge is built.
 */
export type ConnectionPlanEdit =
  | {
      readonly type: "graph.addNode";
      readonly node: GraphNode;
    }
  | {
      readonly type: "graph.addSceneVariable";
      readonly sceneId: string;
      readonly variable: SceneVariable;
    }
  | {
      readonly type: "graph.reparentNode";
      readonly nodeId: string;
      readonly parentId: string | null;
      readonly position: { x: number; y: number };
    }
  | {
      readonly type: "graph.setSourceFieldDefault";
      readonly nodeId: string;
      readonly fieldPath: readonly string[];
      readonly value: unknown;
    }
  | {
      readonly type: "graph.addEdge";
      readonly edge: GraphEdge;
    };

export type ConnectionPlan = { edits: ConnectionPlanEdit[] } | { error: string };

function implicitVariableType(graph: ShowGraph, request: ConnectionRequest): Type | null {
  return sourceTypeAtHandle(graph, request.sourceId, request.sourceHandle);
}

function nextVariableName(variables: readonly SceneVariable[]): string {
  const names = new Set(variables.map((variable) => variable.name));
  let suffix = variables.length + 1;
  while (names.has(`variable${suffix}`)) suffix += 1;
  return `variable${suffix}`;
}

function applyConnectionPlanEdit(graph: ShowGraph, edit: ConnectionPlanEdit): ShowGraph {
  switch (edit.type) {
    case "graph.addNode":
      return { ...graph, nodes: [...graph.nodes, { ...edit.node }] };
    case "graph.addSceneVariable":
      return {
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.kind === "scene" && node.id === edit.sceneId
            ? { ...node, variables: [...node.variables, { ...edit.variable }] }
            : node,
        ),
      };
    case "graph.reparentNode":
      return {
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === edit.nodeId
            ? ({
                ...node,
                parentId: edit.parentId,
                position: { ...edit.position },
              } as GraphNode)
            : node,
        ),
      };
    case "graph.setSourceFieldDefault": {
      const sourceFieldDefaults = (graph.sourceFieldDefaults ?? []).filter(
        (current) =>
          current.nodeId !== edit.nodeId ||
          current.fieldPath.join(".") !== edit.fieldPath.join("."),
      );
      return {
        ...graph,
        sourceFieldDefaults: [
          ...sourceFieldDefaults,
          { nodeId: edit.nodeId, fieldPath: [...edit.fieldPath], value: edit.value },
        ],
      };
    }
    case "graph.addEdge":
      return { ...graph, edges: [...graph.edges, edit.edge] };
  }
}

function unusedId(graph: ShowGraph, base: string, used: (graph: ShowGraph) => string[]): string {
  const existing = new Set(used(graph));
  let id = base;
  while (existing.has(id)) id = `${id}_`;
  return id;
}

function candidateIds(graph: ShowGraph): ConnectionIds {
  return {
    edgeId: unusedId(graph, "edge_candidate", (current) => current.edges.map((edge) => edge.id)),
    variableId: unusedId(graph, "variable_candidate", (current) =>
      current.nodes.flatMap((node) =>
        node.kind === "scene" ? node.variables.map((variable) => variable.id) : [],
      ),
    ),
  };
}
function sourceDefaultForConnection(graph: ShowGraph, request: ConnectionRequest): unknown {
  if (!request.sourceHandle || request.sourceHandle === "out") return undefined;
  const source = findNode(graph, request.sourceId);
  if (source?.kind !== "source") return undefined;
  const sourceValue = defaultSourceValues(graph)[source.id];
  return valueAtPath(sourceValue, [request.sourceHandle]);
}

/**
 * Plans the exact edits a landed connection will execute, or explains why
 * those edits would leave the Show invalid. Validation runs against the graph
 * produced by these same edits, so affordances and execution cannot diverge.
 */
export function planConnection(
  graph: ShowGraph,
  request: ConnectionRequest,
  ids: ConnectionIds,
  options: { readonly addNode?: GraphNode } = {},
): ConnectionPlan {
  let planningGraph = graph;
  const edits: ConnectionPlanEdit[] = [];
  if (options.addNode) {
    if (options.addNode.id !== request.targetId) {
      return { error: "That connection target doesn't match the node being created." };
    }
    const nodeEdit: ConnectionPlanEdit = { type: "graph.addNode", node: { ...options.addNode } };
    edits.push(nodeEdit);
    planningGraph = applyConnectionPlanEdit(planningGraph, nodeEdit);
    if (options.addNode.kind === "source") {
      const sourceValue = sourceDefaultForConnection(planningGraph, request);
      if (sourceValue !== undefined && sourceValue !== null) {
        const defaultEdit: ConnectionPlanEdit = {
          type: "graph.setSourceFieldDefault",
          nodeId: options.addNode.id,
          fieldPath: [],
          value: sourceValue,
        };
        edits.push(defaultEdit);
        planningGraph = applyConnectionPlanEdit(planningGraph, defaultEdit);
      }
    }
  }

  if (request.sourceId === request.targetId) {
    const node = findNode(planningGraph, request.sourceId);
    // A Scene may Navigate to itself (a "retry" transition, #24); nothing
    // else has a meaningful self-edge.
    if (!node || node.kind !== "scene") return { error: "A node can't connect to itself." };
  }
  const producer = findNode(planningGraph, request.sourceId);
  const consumer = findNode(planningGraph, request.targetId);
  if (!producer || !consumer) return { error: "That node isn't in this Show." };

  const kind = connectionKindFor(planningGraph, request);
  if (kind === null) {
    return { error: `A ${producer.kind} can't connect to a ${consumer.kind}.` };
  }

  let targetVariableId = request.targetVariableId;
  if (
    kind === "wiring" &&
    consumer.kind === "scene" &&
    request.targetHandle === SCENE_INPUT_HANDLE &&
    !targetVariableId
  ) {
    const type = implicitVariableType(planningGraph, request);
    if (!type) return { error: "The source must have a Type to create a Variable." };
    const variable: SceneVariable = {
      id: ids.variableId,
      name: nextVariableName(consumer.variables),
      type,
    };
    const variableEdit: ConnectionPlanEdit = {
      type: "graph.addSceneVariable",
      sceneId: consumer.id,
      variable,
    };
    edits.push(variableEdit);
    planningGraph = applyConnectionPlanEdit(planningGraph, variableEdit);
    targetVariableId = variable.id;
  }
  if (kind === "wiring" && consumer.kind === "scene" && !targetVariableId) {
    return { error: "Drop onto one of the Scene's Variables." };
  }

  const edge = connectionEdge(planningGraph, { ...request, targetVariableId }, ids.edgeId);
  if (!edge) return { error: `A ${producer.kind} can't connect to a ${consumer.kind}.` };

  if (
    producer.parentId !== null &&
    producer.parentId !== undefined &&
    consumer.kind === "transformer" &&
    consumer.parentId === null
  ) {
    const reparentEdit: ConnectionPlanEdit = {
      type: "graph.reparentNode",
      nodeId: consumer.id,
      parentId: producer.parentId,
      position: { ...consumer.position },
    };
    edits.push(reparentEdit);
    planningGraph = applyConnectionPlanEdit(planningGraph, reparentEdit);
  }

  const edgeEdit: ConnectionPlanEdit = { type: "graph.addEdge", edge };
  edits.push(edgeEdit);
  planningGraph = applyConnectionPlanEdit(planningGraph, edgeEdit);
  try {
    assertValidShowGraph(planningGraph);
  } catch (error) {
    if (error instanceof InvalidShowGraphError) return { error: humanise(error, kind) };
    throw error;
  }
  return { edits };
}

/**
 * Why this connection can't be made, or null if it can — phrased for a
 * person, since it reaches the palette and the inspector rather than a log.
 */
export function connectionError(graph: ShowGraph, request: ConnectionRequest): string | null {
  const result = planConnection(graph, request, candidateIds(graph));
  return "error" in result ? result.error : null;
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
  switch (error.reason) {
    case "invalidShape":
      return "This Show's shapes are invalid.";
    case "emptyTargetPath":
      return "Drop onto one of the Scene's Variables.";
    case "invalidImageVariableType":
    case "invalidImageDimensions":
      return "That Variable's image settings are invalid.";
    case "missingNode":
      return "That node isn't in this Show.";
    case "duplicateId":
      return "That id is already in use.";
    case "nonFinitePosition":
      return "That node's position is invalid.";
    case "flowNested":
    case "deviceNested":
    case "invalidParent":
      return "That node can't be nested there.";
    case "invalidDefaultScene":
      return "A Flow's default Scene must be inside that Flow.";
    case "emptyPathSegment":
      return "A value path can't contain an empty field.";
    case "valuePathOnNonWiring":
      return "Navigate and Device edges don't carry values.";
    case "invalidWiringSource":
      return "Wiring must start at a Source, Transformer, or virtual Device source.";
    case "invalidDeviceSourceHandle":
      return "Choose one virtual Device source.";
    case "missingSourceField":
    case "missingTransformerField":
      return "That field no longer exists.";
    case "invalidWiringTarget":
      return "Wiring must target a Source, Transformer, or Scene Variable.";
    case "sourceInputPath":
      return "Source inputs aren't named fields.";
    case "missingVariable":
      return "That Scene Variable no longer exists.";
    case "incompatibleTypes":
      return "Those values have incompatible types.";
    case "flowLocalEscape":
      return "A Source inside a Flow can only feed nodes in that Flow.";
    case "invalidNavigateEndpoints":
      return "Navigate edges connect two Scenes.";
    case "crossFlowNavigate":
      return "Navigate edges connect two Scenes in the same Flow.";
    case "nestedSceneDrivesDevice":
      return "A Device is driven by a Flow or a top-level Scene, not by a Scene inside a Flow.";
    case "invalidDeviceSource":
      return "A Device is driven by a Flow or a top-level Scene.";
    case "invalidDeviceTarget":
      return "A Device edge must end at a Device.";
    case "duplicateEdge":
      return kind === "navigate"
        ? "These Scenes are already connected."
        : "That connection already exists.";
    case "wiringFanIn":
      return "A Variable path can only have one producer.";
    case "deviceHasDriver":
      return "That Device already has a driver.";
    case "wiringCycle":
      return "Wiring can't form a cycle.";
    case "missingSourceType":
      return "The source must have a Type.";
    case "invalidNodeColor":
      return "That node color is invalid.";
  }
  const unreachable: never = error.reason;
  return unreachable;
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
