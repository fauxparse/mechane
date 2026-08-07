// The API boundary for graph *content* (issue #41), the counterpart to
// ./graph-to-flow's boundary for graph *shape*.
//
// The graph arrives from GraphQL with every field of every node kind present
// and nullable — `defaultSceneId` on a Source, `variables` on a Device —
// because that's what one GraphQL type covering five node kinds looks like.
// @mechane/domain's `ShowGraph` is a discriminated union instead, where a
// Source simply has no `defaultSceneId` to be null.
//
// Commands (#41) are written against the domain union, not against the wire
// shape, so this is where a graph stops being a query result and becomes the
// thing the editor edits. The conversion is lossy on purpose: fields that
// don't belong to a kind are dropped rather than carried along as nulls.
//
// The other direction is no longer a whole graph (#103): what goes back is a
// list of edits, so `toEditInput` is the outbound half — the same widening
// from a discriminated union to one flat wire shape, per edit instead of per
// graph.
import type { GraphEdit } from "@mechane/commands";
import { isNodeKind } from "@mechane/domain";
import type { GraphEdge, GraphNode, Shape, Type, ShowGraph } from "@mechane/domain";
import type {
  ApplyShowGraphEditsResult,
  ShowGraph as ApiShowGraph,
  ShowGraphEdge as ApiEdge,
} from "@mechane/graphql-schema";

type ApiType = ApiShowGraph["shapes"][number]["fields"][number]["type"];
type ApiVariable = Omit<ApiShowGraph["nodes"][number]["variables"][number], "type"> & {
  type?: ApiType | null;
};
type ApiGraphNode = Omit<ApiShowGraph["nodes"][number], "type" | "variables" | "fieldDefaults"> & {
  type?: ApiType | null;
  fieldDefaults?: ApiShowGraph["nodes"][number]["fieldDefaults"];
  variables?: ApiVariable[] | null;
};

/** Just the parts of the query result this module needs. */
export type ApiGraph = {
  nodes: ApiGraphNode[];
  edges: ApiShowGraph["edges"];
  shapes?: ApiShowGraph["shapes"];
};

function toType(type: ApiType): Type {
  if (type.kind === "array") {
    if (!type.of) throw new Error("Array Shape types must include an element type.");
    return { kind: "array", of: toType(type.of as ApiType) };
  }
  if (type.kind === "shape") {
    if (!type.shapeId) throw new Error("Shape references must include a Shape id.");
    return { kind: "shape", shapeId: type.shapeId };
  }
  if (["text", "number", "boolean", "image", "colour", "date", "datetime"].includes(type.kind)) {
    return type.kind as Type;
  }
  throw new Error(`Unknown Shape type "${type.kind}".`);
}

function toShape(shape: ApiShowGraph["shapes"][number]): Shape {
  return {
    id: shape.id,
    name: shape.name,
    fields: shape.fields
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((field) => ({
        id: field.id,
        name: field.name,
        type: toType(field.type),
        required: field.required,
        defaultValue: field.default
          ? Object.entries(field.default).find(([key]) => key !== "__typename")?.[1] ?? null
          : null,
      })),
  };
}

function toNode(node: ApiGraphNode): GraphNode {
  // Same check, and same reason, as ./graph-to-flow's: `kind` is a string on
  // the wire, and a kind this build doesn't know about should say so rather
  // than become a silently malformed node.
  if (!isNodeKind(node.kind)) {
    throw new Error(`Unknown Show graph node kind "${node.kind}" on node "${node.id}".`);
  }
  const base = {
    id: node.id,
    name: node.name,
    position: { x: node.position.x, y: node.position.y },
  };
  switch (node.kind) {
    case "scene":
      return {
        ...base,
        kind: "scene",
        parentId: node.parentId ?? null,
        variables: (node.variables ?? []).map((variable) => ({
          id: variable.id,
          name: variable.name,
          type: variable.type ? toType(variable.type as ApiType) : null,
        })),
      };
    case "flow":
      // Flows and Devices are always Show-level peers (#23, #26), which the
      // domain types as `parentId: null` — so it's asserted here rather than
      // read, and a wire graph that disagrees fails `assertValidShowGraph`.
      return { ...base, kind: "flow", parentId: null, defaultSceneId: node.defaultSceneId ?? null };
    case "device":
      return {
        ...base,
        kind: "device",
        parentId: null,
        perConnection: node.perConnection,
        // Null while the server hasn't minted one yet (#45) — the state a
        // Device is in between being created on the canvas and the first
        // save coming back.
        pairingCode: node.pairingCode ?? null,
      };
    case "source":
      return {
        ...base,
        kind: "source",
        parentId: node.parentId ?? null,
        type: node.type ? toType(node.type as ApiType) : null,
        fieldDefaults: (node.fieldDefaults ?? []).map((fieldDefault) => ({
          nodeId: node.id,
          fieldPath: [...fieldDefault.fieldPath],
          value: fieldDefault.value,
        })),
      };
    case "transformer":
      return {
        ...base,
        kind: "transformer",
        parentId: node.parentId ?? null,
        type: node.type ? toType(node.type as ApiType) : null,
      };
  }
}

function toEdge(edge: ApiEdge): GraphEdge {
  const base = {
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    sourcePath: [...(edge.sourcePath ?? [])],
    targetPath: [...(edge.targetPath ?? [])],
    ...(edge.kind === "wiring" && edge.fieldMapping
      ? { fieldMapping: { ...edge.fieldMapping } }
      : {}),
  };
  switch (edge.kind) {
    case "navigate":
      return {
        ...base,
        kind: "navigate",
        cueId: edge.cueId ?? null,
        actionId: edge.actionId ?? null,
      };
    case "device":
      return { ...base, kind: "device" };
    case "wiring":
      return { ...base, kind: "wiring" };
    default:
      throw new Error(`Unknown Show graph edge kind "${edge.kind}" on edge "${edge.id}".`);
  }
}

/** The graph as the domain (and therefore as the command layer) wants it. */
export function toShowGraph(graph: ApiGraph | null | undefined): ShowGraph {
  if (!graph) return { shapes: [], nodes: [], edges: [] };
  return {
    shapes: (graph.shapes ?? []).map(toShape),
    nodes: graph.nodes.map(toNode),
    edges: graph.edges.map(toEdge),
  };
}

/**
 * A node as mutation input: the same flat shape the query returns, minus the
 * fields the server derives (a Device's pairing code is minted server-side,
 * #45) and minus the fields that don't belong to this kind.
 */
type TypeInput = { kind: string; of?: TypeInput | null; shapeId?: string | null };

function toTypeInput(type: Type | null | undefined): TypeInput | null {
  if (!type) return null;
  return typeof type === "string"
    ? { kind: type }
    : type.kind === "array"
      ? { kind: "array", of: toTypeInput(type.of) }
      : { kind: "shape", shapeId: type.shapeId };
}

function toNodeInput(node: GraphNode) {
  return {
    id: node.id,
    kind: node.kind,
    name: node.name,
    parentId: node.parentId,
    defaultSceneId: node.kind === "flow" ? node.defaultSceneId : null,
    type: node.kind === "source" || node.kind === "transformer" ? toTypeInput(node.type) : null,
    position: { x: node.position.x, y: node.position.y },
    variables:
      node.kind === "scene"
        ? node.variables.map((v) => ({ id: v.id, name: v.name, type: toTypeInput(v.type) }))
        : [],
    perConnection: node.kind === "device" ? node.perConnection : false,
  };
}

function toEdgeInput(edge: GraphEdge) {
  return {
    id: edge.id,
    kind: edge.kind,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    sourcePath: [...edge.sourcePath],
    targetPath: [...edge.targetPath],
    ...(edge.kind === "wiring" ? { fieldMapping: edge.fieldMapping ?? null } : {}),
    // `targetVariableId` is derived by the server from `targetPath`, so it
    // isn't sent — see `serializeShowGraph` in apps/api.
    cueId: edge.kind === "navigate" ? edge.cueId : null,
    actionId: edge.kind === "navigate" ? edge.actionId : null,
  };
}

/**
 * One edit as the `applyShowGraphEdits` mutation wants it (#103).
 *
 * The command layer's `GraphEdit` is already a plain, serialisable value —
 * this only widens it to the flat input shape GraphQL needs, since GraphQL
 * has no input unions and every edit type therefore shares one field set.
 * Nothing is decided here: an edit that carries a node carries the node it
 * always carried.
 */
export function toEditInput(edit: GraphEdit) {
  const input: {
    type: string;
    nodeId?: string;
    node?: ReturnType<typeof toNodeInput>;
    edgeId?: string;
    edge?: ReturnType<typeof toEdgeInput>;
    position?: { x: number; y: number };
    parentId?: string | null;
    name?: string;
    flowId?: string;
    sceneId?: string | null;
    variableId?: string;
    variable?: { id: string; name: string; type?: TypeInput | null };
  } = { type: edit.type };
  switch (edit.type) {
    case "graph.addNode":
      return { ...input, node: toNodeInput(edit.node) };
    case "graph.removeNode":
      return { ...input, nodeId: edit.nodeId };
    case "graph.moveNode":
      return { ...input, nodeId: edit.nodeId, position: edit.position };
    case "graph.renameNode":
      return { ...input, nodeId: edit.nodeId, name: edit.name };
    case "graph.reparentNode":
      return {
        ...input,
        nodeId: edit.nodeId,
        parentId: edit.parentId,
        position: edit.position,
      };
    case "graph.addEdge":
      return { ...input, edge: toEdgeInput(edit.edge) };
    case "graph.removeEdge":
      return { ...input, edgeId: edit.edgeId };
    case "graph.setFlowDefaultScene":
      return { ...input, flowId: edit.flowId, sceneId: edit.sceneId };
    case "graph.addSceneVariable":
      return {
        ...input,
        sceneId: edit.sceneId,
        variable: { ...edit.variable, type: toTypeInput(edit.variable.type) },
      };
    case "graph.renameSceneVariable":
      return {
        ...input,
        sceneId: edit.sceneId,
        variableId: edit.variableId,
        name: edit.name,
      };
    case "graph.removeSceneVariable":
      return { ...input, sceneId: edit.sceneId, variableId: edit.variableId };
    case "graph.setDevicePairingCode":
      // Server → client only (#45, #111). The editor applies one of these
      // when a response brings it; sending one back would be telling the
      // server something it told us, and `GraphEditInput` has no field for
      // it anyway.
      throw new Error("A pairing code is the server's to mint, not the editor's to send.");
  }
}

/** An amendment as the mutation returns it (#111). */
export type ApiGraphEdit = ApplyShowGraphEditsResult["amendments"][number];

/**
 * An amendment from the server, as an edit the command layer can apply.
 *
 * The inbound counterpart of `toEditInput`, and deliberately narrow: the
 * server only ever sends amendments it has decided for itself, which today is
 * a Device's minted pairing code (#45). Anything else arriving here is a
 * server speaking a dialect this build doesn't know, and saying so beats
 * applying half of it.
 */
export function toGraphEdit(edit: ApiGraphEdit): GraphEdit {
  switch (edit.type) {
    case "graph.setDevicePairingCode":
      if (!edit.nodeId) {
        throw new Error("A pairing-code amendment arrived without a Device.");
      }
      return {
        type: "graph.setDevicePairingCode",
        nodeId: edit.nodeId,
        pairingCode: edit.pairingCode ?? null,
      };
    default:
      throw new Error(`Unknown Show graph amendment "${edit.type}".`);
  }
}
