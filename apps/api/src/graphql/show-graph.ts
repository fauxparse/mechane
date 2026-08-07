// The GraphQL ⇄ domain boundary for the Show graph (issue #38): turning
// loosely-typed mutation input into @mechane/domain's `ShowGraph`, and a
// stored graph back into the shape the schema's types describe.
//
// GraphQL can express "a node has a kind" but not "a Flow never has a
// parent" — so the input types are one flat node/edge shape each, and this
// module is where that flattening is undone before the domain's
// `assertValidShowGraph` sees it. Anything malformed becomes a
// BAD_USER_INPUT GraphQLError here rather than a generic "Unexpected
// error" further in.
import type { GraphEdit } from "@mechane/commands";
import { GRAPH_COMMAND_TYPES } from "@mechane/commands";
import type { GraphEdge, GraphNode } from "@mechane/domain";
import { isEdgeKind, isNodeKind, wiringTargetVariableId } from "@mechane/domain";
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
  perConnection?: boolean | null;
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

/**
 * One edit off the wire (#103), before it becomes a `GraphEdit`.
 *
 * Flat and almost entirely optional, because GraphQL has no input unions:
 * `type` says which of these fields mean anything, and `parseGraphEdit`
 * below is where "a rename needs a name" stops being a convention. An
 * absent field reads as null, which is why nothing here needs to
 * distinguish the two — "clear the default Scene" and "say nothing about
 * the default Scene" are never both legal for the same `type`.
 */
export interface GraphEditInput {
  type: string;
  nodeId?: string | null;
  node?: GraphNodeInput | null;
  edgeId?: string | null;
  edge?: GraphEdgeInput | null;
  position?: PositionInput | null;
  parentId?: string | null;
  name?: string | null;
  flowId?: string | null;
  sceneId?: string | null;
  variableId?: string | null;
  variable?: SceneVariableInput | null;
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
      return {
        ...base,
        kind: "device",
        parentId: null,
        perConnection: input.perConnection ?? false,
        // Never taken from the client (#45): the code is minted and owned
        // server-side, and `writeShowGraph` answers with the real one. A
        // client that sends one is not lying so much as guessing, and
        // either way the stored row wins.
        pairingCode: null,
      };
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

/** The field `type` says this edit must carry, or a BAD_USER_INPUT error. */
function required<T>(edit: GraphEditInput, field: string, value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw badInput(`A "${edit.type}" edit needs a ${field}.`);
  }
  return value;
}

function position(edit: GraphEditInput): { x: number; y: number } {
  const value = required(edit, "position", edit.position);
  return { x: value.x, y: value.y };
}

/**
 * One edit, from wire input to the command layer's own type (#103).
 *
 * The checks here are about the *envelope* — did a rename bring a name —
 * not about the graph. Whether the node being renamed exists is the
 * command's business when the batch is applied, and whether the result is a
 * legal Show is `assertValidShowGraph`'s at the end of it.
 */
export function parseGraphEdit(edit: GraphEditInput): GraphEdit {
  switch (edit.type) {
    case GRAPH_COMMAND_TYPES.addNode:
      return { type: edit.type, node: parseNode(required(edit, "node", edit.node)) };
    case GRAPH_COMMAND_TYPES.removeNode:
      return { type: edit.type, nodeId: required(edit, "nodeId", edit.nodeId) };
    case GRAPH_COMMAND_TYPES.moveNode:
      return {
        type: edit.type,
        nodeId: required(edit, "nodeId", edit.nodeId),
        position: position(edit),
      };
    case GRAPH_COMMAND_TYPES.renameNode:
      return {
        type: edit.type,
        nodeId: required(edit, "nodeId", edit.nodeId),
        name: required(edit, "name", edit.name),
      };
    case GRAPH_COMMAND_TYPES.reparentNode:
      return {
        type: edit.type,
        nodeId: required(edit, "nodeId", edit.nodeId),
        // Null is the whole point here: it means "out to Show level".
        parentId: edit.parentId ?? null,
        position: position(edit),
      };
    case GRAPH_COMMAND_TYPES.addEdge:
      return { type: edit.type, edge: parseEdge(required(edit, "edge", edit.edge)) };
    case GRAPH_COMMAND_TYPES.removeEdge:
      return { type: edit.type, edgeId: required(edit, "edgeId", edit.edgeId) };
    case GRAPH_COMMAND_TYPES.setFlowDefaultScene:
      return {
        type: edit.type,
        flowId: required(edit, "flowId", edit.flowId),
        // Also meaningfully null: a Flow can be left without an entry Scene.
        sceneId: edit.sceneId ?? null,
      };
    case GRAPH_COMMAND_TYPES.addSceneVariable: {
      const variable = required(edit, "variable", edit.variable);
      return {
        type: edit.type,
        sceneId: required(edit, "sceneId", edit.sceneId),
        variable: { id: variable.id, name: variable.name },
      };
    }
    case GRAPH_COMMAND_TYPES.renameSceneVariable:
      return {
        type: edit.type,
        sceneId: required(edit, "sceneId", edit.sceneId),
        variableId: required(edit, "variableId", edit.variableId),
        name: required(edit, "name", edit.name),
      };
    case GRAPH_COMMAND_TYPES.removeSceneVariable:
      return {
        type: edit.type,
        sceneId: required(edit, "sceneId", edit.sceneId),
        variableId: required(edit, "variableId", edit.variableId),
      };
    default:
      // A client speaking a newer dialect than this server. Refusing the
      // batch is the only safe answer: skipping the edit would leave the
      // client believing in a graph the server never built.
      throw badInput(`Unknown Show graph edit "${edit.type}".`);
  }
}

/**
 * The wire shape of a graph. The GraphQL `GraphNode`/`GraphEdge` types are
 * one flat shape each — a client rendering a graph branches on `kind`
 * anyway, and an interface per node kind would make every query five
 * inline fragments long for two extra fields.
 */
export function serializeShowGraph(graph: StoredShowGraph) {
  return {
    showId: graph.showId,
    state: graph.state,
    updatedAt: graph.updatedAt.toISOString(),
    // What the next edit batch has to be composed against (#103).
    version: graph.version,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      name: node.name,
      parentId: node.parentId,
      defaultSceneId: node.kind === "flow" ? node.defaultSceneId : null,
      position: node.position,
      variables: node.kind === "scene" ? node.variables : [],
      perConnection: node.kind === "device" && node.perConnection,
      pairingCode: node.kind === "device" ? node.pairingCode : null,
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
      targetVariableId:
        edge.kind === "wiring" && edge.targetPath.length > 0 ? wiringTargetVariableId(edge) : null,
      cueId: edge.kind === "navigate" ? edge.cueId : null,
      actionId: edge.kind === "navigate" ? edge.actionId : null,
    })),
  };
}
