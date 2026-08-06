// The GraphQL ⇄ domain boundary for the Show graph (issue #38): turning
// loosely-typed mutation input into @presence/domain's `ShowGraph`, and a
// stored graph back into the shape the schema's types describe.
//
// GraphQL can express "a node has a kind" but not "a Flow never has a
// parent" — so the input types are one flat node/edge shape each, and this
// module is where that flattening is undone before the domain's
// `assertValidShowGraph` sees it. Anything malformed becomes a
// BAD_USER_INPUT GraphQLError here rather than a generic "Unexpected
// error" further in.
import type { GraphEdge, GraphNode, ShowGraph } from "@presence/domain";
import { isEdgeKind, isNodeKind, wiringTargetVariableId } from "@presence/domain";
import { GraphQLError } from "graphql";

import type { StoredShowGraph } from "../db/show-graph";

export interface PositionInput {
  x: number;
  y: number;
}

export interface SceneVariableInput {
  id: string;
  name: string;
}

export interface GraphNodeInput {
  id: string;
  kind: string;
  name: string;
  parentId?: string | null;
  defaultSceneId?: string | null;
  position: PositionInput;
  variables?: SceneVariableInput[] | null;
}

export interface GraphEdgeInput {
  id: string;
  kind: string;
  sourceId: string;
  targetId: string;
  sourcePath?: string[] | null;
  targetPath?: string[] | null;
  cueId?: string | null;
  actionId?: string | null;
}

export interface ShowGraphInput {
  nodes: GraphNodeInput[];
  edges: GraphEdgeInput[];
}

function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

function parseNode(input: GraphNodeInput): GraphNode {
  if (!isNodeKind(input.kind)) {
    throw badInput(`Unknown node kind "${input.kind}" on node "${input.id}".`);
  }
  const base = {
    id: input.id,
    name: input.name,
    position: { x: input.position.x, y: input.position.y },
  };
  const parentId = input.parentId ?? null;
  switch (input.kind) {
    case "scene":
      return {
        ...base,
        kind: "scene",
        parentId,
        variables: (input.variables ?? []).map((variable) => ({
          id: variable.id,
          name: variable.name,
        })),
      };
    case "flow":
      if (parentId !== null) {
        // Caught again by the domain, but saying it in the client's own
        // vocabulary ("you sent a parentId") is more use than the generic
        // structural message.
        throw badInput(`Flow "${input.id}" was given a parentId; Flows are never nested.`);
      }
      return {
        ...base,
        kind: "flow",
        parentId: null,
        defaultSceneId: input.defaultSceneId ?? null,
      };
    case "source":
      return { ...base, kind: "source", parentId };
    case "transformer":
      return { ...base, kind: "transformer", parentId };
    case "device":
      if (parentId !== null) {
        throw badInput(`Device "${input.id}" was given a parentId; Devices are Show-level.`);
      }
      return { ...base, kind: "device", parentId: null };
  }
}

function parseEdge(input: GraphEdgeInput): GraphEdge {
  if (!isEdgeKind(input.kind)) {
    throw badInput(`Unknown edge kind "${input.kind}" on edge "${input.id}".`);
  }
  const base = {
    id: input.id,
    sourceId: input.sourceId,
    targetId: input.targetId,
    sourcePath: input.sourcePath ?? [],
    targetPath: input.targetPath ?? [],
  };
  switch (input.kind) {
    case "wiring":
      if (base.targetPath.length === 0) {
        throw badInput(
          `Wiring edge "${input.id}" needs a targetPath naming at least the Scene Variable it feeds.`,
        );
      }
      return { ...base, kind: "wiring" };
    case "navigate":
      return {
        ...base,
        kind: "navigate",
        cueId: input.cueId ?? null,
        actionId: input.actionId ?? null,
      };
    case "device":
      return { ...base, kind: "device" };
  }
}

/** Turns mutation input into a domain graph. Doesn't validate structure — that's the domain's job. */
export function parseShowGraphInput(input: ShowGraphInput): ShowGraph {
  return { nodes: input.nodes.map(parseNode), edges: input.edges.map(parseEdge) };
}

/**
 * The wire shape of a graph. The GraphQL `GraphNode`/`GraphEdge` types are
 * one flat shape each — a client rendering a canvas branches on `kind`
 * anyway, and an interface per node kind would make every query five
 * inline fragments long for two extra fields.
 */
export function serializeShowGraph(graph: StoredShowGraph) {
  return {
    showId: graph.showId,
    state: graph.state,
    updatedAt: graph.updatedAt.toISOString(),
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      name: node.name,
      parentId: node.parentId,
      defaultSceneId: node.kind === "flow" ? node.defaultSceneId : null,
      position: node.position,
      variables: node.kind === "scene" ? node.variables : [],
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      kind: edge.kind,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      sourcePath: edge.sourcePath,
      targetPath: edge.targetPath,
      // Derived, not stored input: the head of a wiring edge's target path
      // is the Variable it lands on, and a client that only cares which
      // Variable is fed shouldn't have to know that.
      targetVariableId: edge.kind === "wiring" ? wiringTargetVariableId(edge) : null,
      cueId: edge.kind === "navigate" ? edge.cueId : null,
      actionId: edge.kind === "navigate" ? edge.actionId : null,
    })),
  };
}
