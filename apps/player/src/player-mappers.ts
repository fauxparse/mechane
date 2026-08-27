import type {
  Block,
  Canvas,
  Element,
  GraphEdge,
  GraphNode,
  Shape,
  SourceValues,
  Type,
} from "@mechane/domain";
import { PRIMITIVE_TYPES } from "@mechane/domain";
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

function toElement(value: unknown): Element {
  const input = record(value);
  const { __typename, children, ...fields } = input;
  return {
    ...withoutNulls(fields),
    type: String(__typename)
      .replace(/Element$/, "")
      .toLowerCase(),
    children: Array.isArray(children) ? children.map(toElement) : [],
  } as unknown as Element;
}

function toCanvas(value: unknown): Canvas {
  const input = record(value);
  return {
    kind: input.kind === "block" ? "block" : "scene",
    root: toElement(input.root) as Extract<Canvas["root"], { type: "frame" }>,
  };
}

function toBlock(value: unknown): Block {
  const input = record(value);
  const canvasInput = record(input.canvas);
  const canvas = toCanvas(canvasInput);
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

function toGraph(value: unknown): PlayerSession["graph"] {
  const input = record(value);
  return {
    ...input,
    nodes: Array.isArray(input.nodes) ? input.nodes.map(toNode) : [],
    edges: Array.isArray(input.edges) ? input.edges.map(toEdge) : [],
    shapes: Array.isArray(input.shapes) ? input.shapes.map(toShape) : [],
    blocks: Array.isArray(input.blocks) ? input.blocks.map(toBlock) : [],
  } as unknown as PlayerSession["graph"];
}

export function normalizePlayerSession(value: unknown): PlayerSession {
  const input = record(value);
  const run = input.run === null ? null : record(input.run);
  const scene = input.scene === null ? null : toNode(input.scene);
  const canvas = input.canvas === null ? null : toCanvas(input.canvas);
  const imageAssets = Array.isArray(input.imageAssets) ? input.imageAssets.map(record) : [];

  return {
    device: record(input.device) as PlayerSession["device"],
    run: run
      ? {
          id: String(run.id),
          showId: String(run.showId),
          status: String(run.status),
          startedAt: String(run.startedAt),
          endedAt: run.endedAt === null ? null : String(run.endedAt),
          sourceValues: run.sourceValues as SourceValues,
        }
      : null,
    graph: toGraph(input.graph),
    scene: scene as PlayerSession["scene"],
    canvas: canvas as PlayerSession["canvas"],
    blocks: Array.isArray(input.blocks) ? input.blocks.map(toBlock) : [],
    imageAssets: imageAssets.map((asset) => ({
      assetId: String(asset.id),
      revision: String(asset.revision),
      url: String(asset.url),
      width: Number(asset.width),
      height: Number(asset.height),
      alt: String(asset.alt),
      mimeType: String(asset.mimeType),
      blurHash: asset.blurHash === null ? null : String(asset.blurHash),
    })),
  };
}
