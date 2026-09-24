// The Player's end of the Show graph API boundary.
//
// Reading the graph is not written here. `decodeShowGraphDocument` is shared
// with the Show Editor (#742, ADR-0020), so what a Show graph document means
// is decided once. This module used to hold its own `toType`, `toShape`,
// `toBlock`, `toNode`, `toEdge`, `toCue`, `toAction` and Event Binding
// decoding over `unknown`, and it had drifted from Studio's: Shape Fields
// arrived unordered and without their authored defaults (#751), Actions
// discriminated on the wire `kind` rather than `__typename`, and a missing
// Transformer formula became the literal string "undefined".
//
// What stays is the session around the graph: which Device this is, the Run
// it is attached to, the Flow bundle a per-connection Device navigates
// locally (ADR-0018), the active Scene and Canvas, and image asset URLs
// resolved against this Player's API origin.
import {
  decodeGraphNode,
  decodeShowGraphDocument,
  decodeCanvasDocument,
} from "@mechane/graphql-schema";
import type { GraphNode, ShowGraph } from "@mechane/domain/graph";
import { type Type, PRIMITIVE_TYPES } from "@mechane/domain/shapes";
import type { SourceValues, StructuredValues } from "@mechane/domain/structured-values";
import { resolveApiUrl } from "./api-url";
import type { PlayerSession } from "./api";

type ApiRecord = Record<string, unknown>;

function record(value: unknown): ApiRecord {
  return value !== null && typeof value === "object" ? (value as ApiRecord) : {};
}

/**
 * A Flow-bundle port's effective Type.
 *
 * Ports on a graph Transformer carry no Type — the domain's
 * `TransformerInputPort` has none. The Flow bundle's copies do, because a
 * per-connection Device evaluates those Transformers itself (ADR-0004) and
 * needs the Type the connected producer delivers.
 */
function toPortType(value: unknown): Type {
  const input = record(value);
  if (input.kind === "array") {
    if (input.of === null || input.of === undefined) {
      throw new Error("Array Shape types must include an element type.");
    }
    return { kind: "array", of: toPortType(input.of) };
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

/**
 * One Flow-bundle Transformer, which is the same node the graph carries plus
 * the typed ports its local evaluation needs.
 */
function toTransformerNode(value: unknown): Extract<GraphNode, { kind: "transformer" }> {
  const input = record(value);
  const node = decodeGraphNode({ ...input, __typename: "TransformerNode" });
  if (node.kind !== "transformer") {
    throw new Error("A Flow bundle Transformer decoded as another node kind.");
  }
  return {
    ...node,
    ports: (Array.isArray(input.ports) ? input.ports : []).map((entry, index) => {
      const port = record(entry);
      return { ...node.ports[index], type: toPortType(port.type) };
    }) as typeof node.ports,
  };
}

function toFlowBundle(value: unknown): PlayerSession["flow"] {
  if (value === null || value === undefined) return null;
  const input = record(value);
  const scenes = Array.isArray(input.scenes)
    ? input.scenes.map((entry) => {
        const item = record(entry);
        const scene = decodeGraphNode(item.scene);
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
    transformers: Array.isArray(input.transformers)
      ? input.transformers.map(toTransformerNode)
      : [],
  };
}

export function normalizePlayerSession(value: unknown, apiBaseUrl?: string): PlayerSession {
  const input = record(value);
  const realtime = record(input.realtime);
  const run = input.run === null ? null : record(input.run);
  const scene = input.scene === null ? null : decodeGraphNode(input.scene);
  // Flat, so arbitrary Canvas depth survives the read: the old recursive
  // query's cap painted the audience a truncated Scene.
  const canvas =
    input.canvas === null
      ? null
      : { ...decodeCanvasDocument(input.canvas), id: String(record(input.canvas).id) };
  const imageAssets = Array.isArray(input.imageAssets) ? input.imageAssets.map(record) : [];
  const flow = toFlowBundle(input.flow);
  const document = decodeShowGraphDocument(input.graph);
  const graph = document.graph;
  const blocks = graph.blocks ?? [];
  // A Flow-local Transformer is evaluated here rather than on the server
  // (ADR-0004), and only the bundle's copy carries its ports' effective
  // Types — so the bundle's node wins for the Transformers it covers.
  const flowTransformers = new Map(
    (flow?.transformers ?? []).map((transformer) => [transformer.id, transformer]),
  );
  const mergedGraph: ShowGraph = {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.kind === "transformer" ? (flowTransformers.get(node.id) ?? node) : node,
    ),
  };
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
          shuffleSeeds: {},
          sourceValues: run.sourceValues as SourceValues,
          structuredValues: run.structuredValues as StructuredValues,
        }
      : null,
    flow,
    graph: mergedGraph,
    graphVersion: document.version,
    scene: scene as PlayerSession["scene"],
    canvas: canvas as PlayerSession["canvas"],
    blocks,
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
