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
import { isNodeKind } from "@mechane/domain";
import type { GraphEdge, GraphNode, ShowGraph } from "@mechane/domain";
import type {
  ShowGraph as ApiShowGraph,
  ShowGraphEdge as ApiEdge,
  ShowGraphNode as ApiNode,
} from "@mechane/graphql-schema";

/** Just the parts of the query result this module needs. */
export type ApiGraph = Pick<ApiShowGraph, "nodes" | "edges">;

function toNode(node: ApiNode): GraphNode {
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
      return { ...base, kind: "source", parentId: node.parentId ?? null };
    case "transformer":
      return { ...base, kind: "transformer", parentId: node.parentId ?? null };
  }
}

function toEdge(edge: ApiEdge): GraphEdge {
  const base = {
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    sourcePath: [...(edge.sourcePath ?? [])],
    targetPath: [...(edge.targetPath ?? [])],
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
  if (!graph) return { nodes: [], edges: [] };
  return { nodes: graph.nodes.map(toNode), edges: graph.edges.map(toEdge) };
}

/**
 * The graph as the `saveShowGraph` mutation wants it (issue #42): the same flat
 * node/edge shape the query returns, minus the fields the server derives.
 *
 * The inverse of `toShowGraph`, and the reason the round trip is lossless in
 * the direction that matters: what the editor holds is the domain graph, and
 * this is the one place it becomes input again.
 */
export function toGraphInput(graph: ShowGraph) {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      name: node.name,
      parentId: node.parentId,
      defaultSceneId: node.kind === "flow" ? node.defaultSceneId : null,
      position: { x: node.position.x, y: node.position.y },
      variables:
        node.kind === "scene" ? node.variables.map((v) => ({ id: v.id, name: v.name })) : [],
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      kind: edge.kind,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      sourcePath: edge.sourcePath,
      targetPath: edge.targetPath,
      // `targetVariableId` is derived by the server from `targetPath`, so it
      // isn't sent — see `serializeShowGraph` in apps/api.
      cueId: edge.kind === "navigate" ? edge.cueId : null,
      actionId: edge.kind === "navigate" ? edge.actionId : null,
    })),
  };
}
