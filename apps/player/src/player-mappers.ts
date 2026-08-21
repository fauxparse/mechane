import type { Canvas, Element, GraphEdge, GraphNode, SourceValues } from "@mechane/domain";
import type { PlayerSession } from "./api";

type ApiRecord = Record<string, unknown>;

function record(value: unknown): ApiRecord {
  return value !== null && typeof value === "object" ? (value as ApiRecord) : {};
}

function withoutNulls(value: ApiRecord): ApiRecord {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null));
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
  const type = sourceType ?? transformerType ?? fields.type;
  return {
    ...withoutNulls(fields),
    kind: nodeKind(__typename),
    ...(type !== undefined && type !== null ? { type } : {}),
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
    type: String(__typename).replace(/Element$/, "").toLowerCase(),
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

function toGraph(value: unknown): PlayerSession["graph"] {
  const input = record(value);
  return {
    ...input,
    nodes: Array.isArray(input.nodes) ? input.nodes.map(toNode) : [],
    edges: Array.isArray(input.edges) ? input.edges.map(toEdge) : [],
    shapes: Array.isArray(input.shapes) ? input.shapes : [],
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
