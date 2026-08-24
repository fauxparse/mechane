// The API boundary for graph *content* (issue #41), the counterpart to
// ./graph-to-flow's boundary for graph *shape*.
//
// The graph arrives from GraphQL as a GraphNode interface with one concrete
// fragment per node kind. This boundary converts __typename back into
// @mechane/domain's discriminated union, where a Source simply has no
// defaultSceneId field at all.
//
// Commands (#41) are written against the domain union, not against the wire
// shape, so this is where a graph stops being a query result and becomes the
// thing the editor edits. The conversion is lossy on purpose: fields that
// don't belong to a kind are dropped rather than carried along as nulls.
//
// The other direction is no longer a whole graph (#103): what goes back is a
// list of edits, so `toEditInput` is the outbound half — the same widening
// from a discriminated union to one flat wire shape, per edit instead of per
// graph. For *graph* edits that widening is not written here: it is
// @mechane/commands' `encodeGraphEdit`, the same descriptor the server
// decodes with (#347), so a field cannot travel one way only. What stays here
// is the Canvas edit vocabulary, which has no server-side counterpart to
// disagree with, and the one policy this end owns: a pairing code is not the
// editor's to send.
import type { CanvasWorkspaceEdit, FlatGraphEdit, GraphEdit } from "@mechane/commands";
import { decodeGraphEdit, encodeGraphEdit, GRAPH_COMMAND_TYPES } from "@mechane/commands";
import type { GraphEdge, GraphNode, Shape, ShowGraph, Type } from "@mechane/domain";
import { isFlowColor } from "@mechane/domain";
import type { ShowGraph as ApiShowGraph, ApplyShowEditsResult } from "@mechane/graphql-schema";
type ApiType = ApiShowGraph["shapes"][number]["fields"][number]["type"];
type ApiGraphNode = {
  __typename: string;
  id: string;
  name: string;
  parentId: string | null;
  position: { x: number; y: number };
  defaultSceneId?: string | null;
  color?: unknown;
  sourceType?: ApiType;
  transformerType?: ApiType | null;
  fieldDefaults?: { fieldPath: string[]; value: unknown }[];
  variables?: {
    id: string;
    name: string;
    rank?: string | null;
    type?: ApiType | null;
    suggestedDimensions?: { width: number; height: number } | null;
  }[];
  perConnection?: boolean;
  pairingCode?: string | null;
};
type ApiSceneNode = ApiGraphNode & {
  __typename: "SceneNode";
  variables: NonNullable<ApiGraphNode["variables"]>;
};
type ApiSourceNode = ApiGraphNode & {
  __typename: "SourceNode";
  sourceType: ApiType;
  fieldDefaults: NonNullable<ApiGraphNode["fieldDefaults"]>;
};
type ApiTransformerNode = ApiGraphNode & {
  __typename: "TransformerNode";
  transformerType?: ApiType | null;
};
type ApiGraphEdge = {
  __typename: string;
  id: string;
  sourceId: string;
  targetId: string;
  sourcePath?: string[] | null;
  targetPath?: string[] | null;
  fieldMapping?: unknown;
  targetVariableId?: string | null;
  cueId?: string | null;
  actionId?: string | null;
};

/** Just the parts of the query result this module needs. */
export type ApiGraph = {
  nodes: ApiGraphNode[];
  edges: ApiGraphEdge[];
  shapes?: ApiShowGraph["shapes"];
  sourceFieldDefaults?: { nodeId: string; fieldPath: string[]; value: unknown }[];
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
  if (["text", "number", "boolean", "image", "color", "date", "datetime"].includes(type.kind)) {
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
        defaultValue:
          field.default?.__typename === "ImageValue"
            ? field.default
            : field.default
              ? (Object.entries(field.default).find(([key]) => key !== "__typename")?.[1] ?? null)
              : null,
      })),
  };
}

function toNode(node: ApiGraphNode): GraphNode {
  const color =
    node.color === null || node.color === undefined
      ? undefined
      : typeof node.color === "string" && isFlowColor(node.color)
        ? node.color
        : (() => {
            throw new Error(
              `Unknown Show node color "${String(node.color)}" on node "${node.id}".`,
            );
          })();
  const base = {
    id: node.id,
    name: node.name,
    parentId: node.parentId ?? null,
    position: { x: node.position.x, y: node.position.y },
    ...(color ? { color } : {}),
  };
  switch (node.__typename) {
    case "SceneNode": {
      const scene = node as ApiSceneNode;
      return {
        ...base,
        kind: "scene",
        variables: scene.variables.map((variable) => ({
          id: variable.id,
          name: variable.name,
          ...(variable.rank ? { rank: variable.rank } : {}),
          type: variable.type ? toType(variable.type as ApiType) : null,
          ...(variable.suggestedDimensions
            ? { suggestedDimensions: variable.suggestedDimensions }
            : {}),
        })),
      };
    }
    case "FlowNode":
      // Flows and Devices are always Show-level peers (#23, #26), which the
      // domain types as `parentId: null` — so it is asserted here rather than
      // read, and a wire graph that disagrees fails domain validation.
      return {
        ...base,
        kind: "flow",
        parentId: null,
        defaultSceneId: node.defaultSceneId ?? null,
      };
    case "DeviceNode":
      return {
        ...base,
        kind: "device",
        parentId: null,
        perConnection: node.perConnection ?? false,
        pairingCode: node.pairingCode ?? null,
      };
    case "SourceNode": {
      const source = node as ApiSourceNode;
      return {
        ...base,
        kind: "source",
        parentId: source.parentId ?? null,
        type: toType(source.sourceType as ApiType),
      };
    }
    case "TransformerNode": {
      const transformer = node as ApiTransformerNode;
      return {
        ...base,
        kind: "transformer",
        parentId: transformer.parentId ?? null,
        type: transformer.transformerType ? toType(transformer.transformerType as ApiType) : null,
      };
    }
    default:
      throw new Error(
        `Unknown Show graph node typename "${node.__typename}" on node "${node.id}".`,
      );
  }
}

function toEdge(edge: ApiGraphEdge): GraphEdge {
  const base = {
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    sourcePath: [...(edge.sourcePath ?? [])],
    targetPath: [...(edge.targetPath ?? [])],
    ...(edge.__typename === "WiringEdge" && edge.fieldMapping
      ? { fieldMapping: { ...(edge.fieldMapping as Record<string, string>) } }
      : {}),
  };
  switch (edge.__typename) {
    case "NavigateEdge":
      return {
        ...base,
        kind: "navigate",
        cueId: edge.cueId ?? null,
        actionId: edge.actionId ?? null,
      };
    case "DeviceEdge":
      return { ...base, kind: "device" };
    case "WiringEdge":
      return { ...base, kind: "wiring" };
    default:
      throw new Error(
        `Unknown Show graph edge typename "${edge.__typename}" on edge "${edge.id}".`,
      );
  }
}

export function toShowGraph(graph: ApiGraph | null | undefined): ShowGraph {
  if (!graph) return { shapes: [], nodes: [], edges: [] };
  return {
    shapes: (graph.shapes ?? []).map(toShape),
    sourceFieldDefaults: (graph.sourceFieldDefaults ?? []).map((fieldDefault) => ({
      nodeId: fieldDefault.nodeId,
      fieldPath: [...fieldDefault.fieldPath],
      value: fieldDefault.value,
    })),
    nodes: graph.nodes.map(toNode),
    edges: graph.edges.map(toEdge),
  };
}

/**
 * One Studio edit as the mutation input wants it (#103, #164).
 *
 * Graph edits already carry their whole target. Canvas workspace edits carry
 * the Canvas id outside the tree edit because one Canvas edit vocabulary is
 * shared by every artboard.
 */
export type StudioEdit = GraphEdit | CanvasWorkspaceEdit;

/**
 * One Studio edit, flat, as the `ShowEditInput` mutation wants it.
 *
 * The graph half is `FlatGraphEdit` (the codec's shape, #347); the Canvas
 * half adds the Canvas id and the element fields, which travel only in this
 * direction and have no inbound counterpart to drift from.
 */
export type StudioEditInput = FlatGraphEdit & {
  canvasId?: string;
  elementId?: string;
  rank?: string;
  element?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  unsetProperties?: string[];
};

export function toEditInput(edit: StudioEdit): StudioEditInput {
  if ("canvasId" in edit) {
    const canvasEdit = edit.edit;
    const input: StudioEditInput = { type: canvasEdit.type, canvasId: edit.canvasId };
    switch (canvasEdit.type) {
      case "canvas.addElement":
        return {
          ...input,
          parentId: canvasEdit.parentId,
          rank: canvasEdit.rank,
          element: canvasEdit.element,
        };
      case "canvas.removeElement":
        return { ...input, elementId: canvasEdit.elementId };
      case "canvas.updateElement":
        return {
          ...input,
          elementId: canvasEdit.elementId,
          properties: canvasEdit.properties,
          ...(canvasEdit.unsetProperties
            ? { unsetProperties: [...canvasEdit.unsetProperties] }
            : {}),
        };
      case "canvas.reparentElement":
        return {
          ...input,
          elementId: canvasEdit.elementId,
          parentId: canvasEdit.parentId,
          rank: canvasEdit.rank,
        };
      case "canvas.moveArtboard":
        return { ...input, position: canvasEdit.position };
    }
  }

  if (edit.type === GRAPH_COMMAND_TYPES.setDevicePairingCode) {
    throw new Error("A pairing code is the server's to mint, not the editor's to send.");
  }
  return encodeGraphEdit(edit);
}

/** An amendment as the mutation returns it (#111). */
export type ApiGraphEdit = ApplyShowEditsResult["amendments"][number];

/**
 * An amendment from the server, as an edit the command layer can apply.
 *
 * The inbound counterpart of `toEditInput`, through the same descriptor
 * (#347): what the server tells this editor about a change it didn't make is
 * the same vocabulary a realtime channel will use for a change someone else
 * made (ADR-0003), so widening the amendments this editor understands is a
 * matter of widening the mutation's selection set, not of writing another
 * table. An amendment naming a type this build has never heard of throws
 * rather than applying half of it.
 */
export function toGraphEdit(edit: ApiGraphEdit): GraphEdit {
  return decodeGraphEdit(edit);
}
