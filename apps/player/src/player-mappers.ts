import {
  decodeEventBinding,
  type Action,
  type Block,
  type Cue,
  type GraphEdge,
  type GraphNode,
  type Shape,
  type SourceValues,
  type StructuredValues,
  type Type,
} from "@mechane/domain";
import { PRIMITIVE_TYPES } from "@mechane/domain";
import { decodeCanvasDocument } from "@mechane/graphql-schema";
import { resolveApiUrl } from "./api-url";
import type { PlayerSession } from "./api";

type ApiRecord = Record<string, unknown>;

function record(value: unknown): ApiRecord {
  return value !== null && typeof value === "object" ? (value as ApiRecord) : {};
}

function withoutNulls(value: ApiRecord): ApiRecord {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null));
}

function toType(value: unknown): Type {
  const input = record(value);
  if (input.kind === "array") {
    if (input.of === null || input.of === undefined) {
      throw new Error("Array Shape types must include an element type.");
    }
    return { kind: "array", of: toType(input.of) };
  }
  if (input.kind === "shape") {
    if (typeof input.shapeId !== "string" || input.shapeId.length === 0) {
      throw new Error("Shape references must include a Shape id.");
    }
    return { kind: "shape", shapeId: input.shapeId };
  }
  const primitive = PRIMITIVE_TYPES.find((candidate) => candidate === input.kind);
  if (primitive) return primitive;
  throw new Error(`Unknown Player Type "${String(input.kind)}".`);
}

function toShape(value: unknown): Shape {
  const input = record(value);
  const fields = Array.isArray(input.fields) ? input.fields : [];
  return {
    id: String(input.id),
    name: String(input.name),
    fields: fields.map((field) => {
      const normalized = record(field);
      return {
        id: String(normalized.id),
        name: String(normalized.name),
        type: toType(normalized.type),
        required: normalized.required === true,
        defaultValue: normalized.defaultValue,
      };
    }),
  };
}

function nodeKind(typename: unknown): GraphNode["kind"] {
  switch (typename) {
    case "SceneNode":
      return "scene";
    case "FlowNode":
      return "flow";
    case "SourceNode":
      return "source";
    case "TransformerNode":
      return "transformer";

    case "DeviceNode":
      return "device";
    default:
      throw new Error(`Unknown Player graph node type: ${String(typename)}.`);
  }
}

function edgeKind(typename: unknown): GraphEdge["kind"] {
  switch (typename) {
    case "WiringEdge":
      return "wiring";
    case "NavigateEdge":
      return "navigate";
    case "DeviceEdge":
      return "device";
    default:
      throw new Error(`Unknown Player graph edge type: ${String(typename)}.`);
  }
}

function toNode(value: unknown): GraphNode {
  const input = record(value);
  const { __typename, sourceType, transformerType, ...fields } = input;
  const normalizedFields = Object.fromEntries(
    Object.entries(withoutNulls(fields)).filter(([key]) => key !== "fieldDefaults"),
  );
  if (Array.isArray(normalizedFields.variables)) {
    normalizedFields.variables = normalizedFields.variables.map((variable) => {
      const normalized = withoutNulls(record(variable));
      const variableType = normalized.type;
      return {
        ...normalized,
        ...(variableType !== undefined && variableType !== null
          ? { type: toType(variableType) }
          : {}),
      };
    });
  }
  const type = sourceType ?? transformerType ?? fields.type;
  return {
    ...normalizedFields,
    kind: nodeKind(__typename),
    ...(type !== undefined && type !== null ? { type: toType(type) } : {}),
  } as GraphNode;
}

function toEdge(value: unknown): GraphEdge {
  const input = record(value);
  const { __typename, ...fields } = input;
  return { ...withoutNulls(fields), kind: edgeKind(__typename) } as GraphEdge;
}

function toBlock(value: unknown): Block {
  const input = record(value);
  const canvasInput = record(input.canvas);
  const canvas = decodeCanvasDocument(canvasInput);
  const variables = Array.isArray(input.variables)
    ? input.variables.map((variable) => {
        const normalized = record(variable);
        return {
          id: String(normalized.id),
          name: String(normalized.name),
          type: toType(normalized.type),
          required: normalized.required === true,
          defaultValue: normalized.defaultValue,
        };
      })
    : [];
  const states = Array.isArray(input.states)
    ? input.states.map((state) => {
        const normalized = record(state);
        const overrides = Array.isArray(normalized.overrides)
          ? normalized.overrides.map((override) => {
              const item = record(override);
              return {
                elementId: String(item.elementId),
                property: String(item.property),
                value: item.value,
              };
            })
          : [];
        return {
          id: String(normalized.id),
          name: String(normalized.name),
          isDefault: normalized.isDefault === true,
          overrides,
        };
      })
    : [];
  return {
    id: String(input.id),
    name: String(input.name),
    canvas: { ...canvas, id: String(canvasInput.id) },
    variables,
    states,
    stateSelectorVariableId:
      typeof input.stateSelectorVariableId === "string" ? input.stateSelectorVariableId : null,
  };
}

function toFlowBundle(value: unknown): PlayerSession["flow"] {
  if (value === null || value === undefined) return null;
  const input = record(value);
  const scenes = Array.isArray(input.scenes)
    ? input.scenes.map((entry) => {
        const item = record(entry);
        const scene = toNode(item.scene);
        if (scene.kind !== "scene")
          throw new Error("Player Flow bundle contains a non-Scene node.");
        if (item.canvas === null || item.canvas === undefined) {
          throw new Error(`Player Scene "${scene.id}" has no Canvas.`);
        }
        const canvasInput = record(item.canvas);
        return {
          scene,
          canvas: {
            ...decodeCanvasDocument(canvasInput),
            id: String(canvasInput.id),
            ownerId: scene.id,
            ownerName: scene.name,
          },
        };
      })
    : [];
  return {
    flowId: String(input.flowId),
    defaultSceneId: input.defaultSceneId === null ? null : String(input.defaultSceneId),
    scenes,
  };
}

function toCue(value: unknown): Cue {
  const input = record(value);
  const owner =
    input.ownerKind === "scene"
      ? { kind: "scene" as const, sceneId: String(input.sceneId) }
      : { kind: "block" as const, blockId: String(input.blockId) };
  return {
    id: String(input.id),
    name: String(input.name),
    owner,
    actionIds: Array.isArray(input.actionIds) ? input.actionIds.map(String) : [],
  };
}

function toAction(value: unknown): Action {
  const input = record(value);
  return {
    id: String(input.id),
    cueId: String(input.cueId),
    kind: "navigate",
    targetSceneId: String(input.targetSceneId),
  };
}

function toGraph(value: unknown): PlayerSession["graph"] {
  const input = record(value);
  return {
    ...input,
    nodes: Array.isArray(input.nodes) ? input.nodes.map(toNode) : [],
    edges: Array.isArray(input.edges) ? input.edges.map(toEdge) : [],
    shapes: Array.isArray(input.shapes) ? input.shapes.map(toShape) : [],
    blocks: Array.isArray(input.blocks) ? input.blocks.map(toBlock) : [],
    cues: Array.isArray(input.cues) ? input.cues.map(toCue) : [],
    actions: Array.isArray(input.actions) ? input.actions.map(toAction) : [],
    eventBindings: Array.isArray(input.eventBindings)
      ? input.eventBindings.map((item) =>
          decodeEventBinding(record(item) as Parameters<typeof decodeEventBinding>[0]),
        )
      : [],
  } as unknown as PlayerSession["graph"];
}

export function normalizePlayerSession(value: unknown, apiBaseUrl?: string): PlayerSession {
  const input = record(value);
  const realtime = record(input.realtime);
  const run = input.run === null ? null : record(input.run);
  const scene = input.scene === null ? null : toNode(input.scene);
  // query's cap painted the audience a truncated Scene.
  const canvas =
    input.canvas === null
      ? null
      : { ...decodeCanvasDocument(input.canvas), id: String(record(input.canvas).id) };
  const imageAssets = Array.isArray(input.imageAssets) ? input.imageAssets.map(record) : [];
  const flow = toFlowBundle(input.flow);

  return {
    device: record(input.device) as PlayerSession["device"],
    realtime: {
      channel: String(realtime.channel),
      grant: String(realtime.grant),
      expiresAt: String(realtime.expiresAt),
    },
    run: run
      ? {
          id: String(run.id),
          showId: String(run.showId),
          status: String(run.status),
          startedAt: String(run.startedAt),
          endedAt: run.endedAt === null ? null : String(run.endedAt),
          stateSequence: Number(run.stateSequence),
          sourceValues: run.sourceValues as SourceValues,
          structuredValues: run.structuredValues as StructuredValues,
        }
      : null,
    flow,
    graph: toGraph(input.graph),
    scene: scene as PlayerSession["scene"],
    canvas: canvas as PlayerSession["canvas"],
    blocks: Array.isArray(input.blocks) ? input.blocks.map(toBlock) : [],
    imageAssets: imageAssets.map((asset) => ({
      assetId: String(asset.id),
      revision: String(asset.revision),
      url: apiBaseUrl ? resolveApiUrl(String(asset.url), apiBaseUrl) : String(asset.url),
      width: Number(asset.width),
      height: Number(asset.height),
      alt: String(asset.alt),
      mimeType: String(asset.mimeType),
      blurHash: asset.blurHash === null ? null : String(asset.blurHash),
    })),
  };
}
