// The Show graph (issue #38): the single unified node graph that is both
// the Scene/Flow state machine and the Show-level wiring graph (PRD.md
// §6.2 — one canvas, not two). See /CONTEXT.md for the vocabulary.
//
// This module defines what a graph *is* and which structures are
// well-formed. It deliberately stops short of the connection rules that
// reject an otherwise well-formed edge — fan-in, wiring cycles, one target
// per Device all belong to the Connection validation slice (issue #24).
// The split is: this module decides what's representable, that one decides
// what's permitted.
//
// Locked decisions this encodes (issues #20, #23, #25, #26, #29):
//
//   - Five node kinds. Variables are *ports on a Scene*, not nodes.
//   - Containment in a Flow is the only representation of both Scene
//     nesting and "Flow-local" placement — there is no `flowLocal` flag
//     anywhere below, by design (#29).
//   - No Flow-in-Flow (#23); Devices are always Show-level peers (#26).
//   - Three edge kinds, all producer → consumer (#20 as corrected by #26).
//   - Positions are free-form stored data; no auto-layout (#25).
//   - A Show with zero Flows is valid and unremarkable (#25).

import type { EntityName } from "./id";

/** The kinds of node that render on the Show canvas. Nothing else does. */
export const NODE_KINDS = ["scene", "flow", "source", "transformer", "device"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** The kinds of edge. All three run producer → consumer. */
export const EDGE_KINDS = ["wiring", "navigate", "device"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

/**
 * Draft and published are two independently readable states of the same
 * Show's graph, per ADR-0002: structure (including Device wiring, #25)
 * reaches Devices only via an explicit publish.
 */
export const GRAPH_STATES = ["draft", "published"] as const;
export type GraphState = (typeof GRAPH_STATES)[number];

/** Free-form canvas coordinates (#25). Stored, never derived. */
export interface Position {
  x: number;
  y: number;
}

/** A named port on a Scene node. A wiring edge targets one of these. */
export interface SceneVariable {
  id: string;
  name: string;
}

interface BaseNode {
  id: string;
  name: string;
  position: Position;
  /**
   * The Flow containing this node, or null for a Show-level node. This one
   * field carries both Scene nesting and Flow-local placement — see the
   * header note on #29.
   */
  parentId: string | null;
}

export interface SceneNode extends BaseNode {
  kind: "scene";
  variables: SceneVariable[];
}

export interface FlowNode extends BaseNode {
  kind: "flow";
  /** Always null: Flows are Show-level peers, never nested (#23). */
  parentId: null;
  /** The Flow's design-time entry Scene, if one has been chosen (#23). */
  defaultSceneId: string | null;
}

export interface SourceNode extends BaseNode {
  kind: "source";
}

export interface TransformerNode extends BaseNode {
  kind: "transformer";
}

export interface DeviceNode extends BaseNode {
  kind: "device";
  /** Always null: a Device is a Show-level endpoint, never inside a Flow. */
  parentId: null;
}

export type GraphNode = SceneNode | FlowNode | SourceNode | TransformerNode | DeviceNode;

/** Source | Transformer output → a named Variable handle on a Scene. */
export interface WiringEdge {
  id: string;
  kind: "wiring";
  sourceId: string;
  targetId: string;
  targetVariableId: string;
}

/**
 * Scene → Scene inside one Flow. Parallel edges are allowed, one per
 * distinct Cue/Action pairing, so the canvas shows *why* a transition
 * exists (#20). Cues and Actions aren't modelled yet, so the pairing is
 * carried as opaque ids that are null until they are.
 */
export interface NavigateEdge {
  id: string;
  kind: "navigate";
  sourceId: string;
  targetId: string;
  cueId: string | null;
  actionId: string | null;
}

/** Flow | top-level Scene → Device: "this Device displays whatever's here." */
export interface DeviceEdge {
  id: string;
  kind: "device";
  sourceId: string;
  targetId: string;
}

export type GraphEdge = WiringEdge | NavigateEdge | DeviceEdge;

/** A whole Show graph in one state (draft or published). */
export interface ShowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** The empty graph a Show starts life with. Valid — zero Flows is fine (#25). */
export function emptyShowGraph(): ShowGraph {
  return { nodes: [], edges: [] };
}

export class InvalidShowGraphError extends Error {
  constructor(reason: string) {
    super(`Invalid Show graph: ${reason}`);
    this.name = "InvalidShowGraphError";
  }
}

export class InvalidGraphStateError extends Error {
  constructor(value: string) {
    super(`Invalid Show graph state: "${value}". Expected one of: ${GRAPH_STATES.join(", ")}.`);
    this.name = "InvalidGraphStateError";
  }
}

/** Throws `InvalidGraphStateError` unless `value` names a graph state. */
export function assertValidGraphState(value: string): GraphState {
  if (!GRAPH_STATES.includes(value as GraphState)) {
    throw new InvalidGraphStateError(value);
  }
  return value as GraphState;
}

/** Whether `value` names a node kind. */
export function isNodeKind(value: string): value is NodeKind {
  return NODE_KINDS.includes(value as NodeKind);
}

/** Whether `value` names an edge kind. */
export function isEdgeKind(value: string): value is EdgeKind {
  return EDGE_KINDS.includes(value as EdgeKind);
}

/**
 * The id-prefix entity a node of `kind` is identified by, so a node's id
 * announces its kind (see `ID_PREFIXES` in ./id).
 */
export const NODE_ID_ENTITIES = {
  scene: "scene",
  flow: "flow",
  source: "source",
  transformer: "transformer",
  device: "device",
} as const satisfies Record<NodeKind, EntityName>;

// ---------------------------------------------------------------------------
// Structural queries
// ---------------------------------------------------------------------------

/**
 * The Flow a node sits inside, or null if it's Show-level. This is the
 * whole of "is it Flow-local?" — there's nothing else to consult (#29).
 */
export function containingFlowId(node: GraphNode): string | null {
  return node.parentId;
}

/**
 * Whether `node` is Flow-local — i.e. placed inside a Flow. Applies to
 * Sources and Transformers (per-audience-instance scoping, #29) exactly as
 * it does to Scenes (nesting, #23): same field, same meaning.
 */
export function isFlowLocal(node: GraphNode): boolean {
  return node.parentId !== null;
}

/** The nodes contained by `flowId`, in graph order. */
export function nodesInFlow(graph: ShowGraph, flowId: string): GraphNode[] {
  return graph.nodes.filter((node) => node.parentId === flowId);
}

/** The Show-level nodes — those not inside any Flow. */
export function topLevelNodes(graph: ShowGraph): GraphNode[] {
  return graph.nodes.filter((node) => node.parentId === null);
}

/** Looks a node up by id, or null if the graph has no such node. */
export function findNode(graph: ShowGraph, nodeId: string): GraphNode | null {
  return graph.nodes.find((node) => node.id === nodeId) ?? null;
}

// ---------------------------------------------------------------------------
// Structural invariants
// ---------------------------------------------------------------------------

function requireNode(nodes: Map<string, GraphNode>, id: string, role: string): GraphNode {
  const node = nodes.get(id);
  if (!node) {
    throw new InvalidShowGraphError(`${role} references node "${id}", which isn't in the graph.`);
  }
  return node;
}

function assertUniqueIds(ids: Iterable<string>, what: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new InvalidShowGraphError(`duplicate ${what} "${id}".`);
    }
    seen.add(id);
  }
}

function assertFinitePosition(node: GraphNode): void {
  if (!Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) {
    throw new InvalidShowGraphError(`node "${node.id}" has a non-finite position.`);
  }
}

function assertValidNesting(node: GraphNode, nodes: Map<string, GraphNode>): void {
  // Read through a widened binding: `FlowNode.parentId` is typed `null`, so
  // the compiler would narrow the two checks below away — but a graph
  // arriving off the wire isn't type-checked, and this is where that claim
  // is actually enforced (#23, #26).
  const parentId: string | null = node.parentId;
  if (parentId === null) return;
  if (node.kind === "flow") {
    throw new InvalidShowGraphError(`Flow "${node.id}" is nested inside another node.`);
  }
  if (node.kind === "device") {
    throw new InvalidShowGraphError(`Device "${node.id}" is nested inside a Flow.`);
  }
  const parent = requireNode(nodes, parentId, `Node "${node.id}"`);
  if (parent.kind !== "flow") {
    throw new InvalidShowGraphError(
      `node "${node.id}" is nested inside "${parent.id}", which is a ${parent.kind}, not a Flow.`,
    );
  }
}

function assertValidDefaultScene(flow: FlowNode, nodes: Map<string, GraphNode>): void {
  if (flow.defaultSceneId === null) return;
  const scene = requireNode(nodes, flow.defaultSceneId, `Flow "${flow.id}"'s default Scene`);
  if (scene.kind !== "scene" || scene.parentId !== flow.id) {
    throw new InvalidShowGraphError(
      `Flow "${flow.id}"'s default Scene must be a Scene inside that Flow.`,
    );
  }
}

function assertValidWiringEdge(edge: WiringEdge, nodes: Map<string, GraphNode>): void {
  const producer = requireNode(nodes, edge.sourceId, `Wiring edge "${edge.id}"`);
  if (producer.kind !== "source" && producer.kind !== "transformer") {
    throw new InvalidShowGraphError(
      `wiring edge "${edge.id}" starts at a ${producer.kind}; only a Source or Transformer produces data.`,
    );
  }
  const consumer = requireNode(nodes, edge.targetId, `Wiring edge "${edge.id}"`);
  if (consumer.kind !== "scene") {
    throw new InvalidShowGraphError(
      `wiring edge "${edge.id}" targets a ${consumer.kind}; wiring always targets a Variable on a Scene.`,
    );
  }
  if (!consumer.variables.some((variable) => variable.id === edge.targetVariableId)) {
    throw new InvalidShowGraphError(
      `wiring edge "${edge.id}" targets Variable "${edge.targetVariableId}", which Scene "${consumer.id}" doesn't have.`,
    );
  }
  // Flow-local scoping (#29): a Flow-local producer's value only exists
  // per audience instance of its own Flow, so it can't feed anything
  // outside that Flow. Show-level producers stay unrestricted. This is a
  // placement rule, not a connection rule — hence here and not in #24.
  if (producer.parentId !== null && producer.parentId !== consumer.parentId) {
    throw new InvalidShowGraphError(
      `wiring edge "${edge.id}" feeds a Flow-local ${producer.kind} into a node outside its Flow.`,
    );
  }
}

function assertValidNavigateEdge(edge: NavigateEdge, nodes: Map<string, GraphNode>): void {
  const from = requireNode(nodes, edge.sourceId, `Navigate edge "${edge.id}"`);
  const to = requireNode(nodes, edge.targetId, `Navigate edge "${edge.id}"`);
  if (from.kind !== "scene" || to.kind !== "scene") {
    throw new InvalidShowGraphError(`Navigate edge "${edge.id}" must run from a Scene to a Scene.`);
  }
  // A Flow *is* the state machine, so a Navigate edge only means anything
  // inside one, and never across two (each Flow is siloed — #19, #25).
  if (from.parentId === null || from.parentId !== to.parentId) {
    throw new InvalidShowGraphError(
      `Navigate edge "${edge.id}" must connect two Scenes in the same Flow.`,
    );
  }
}

function assertValidDeviceEdge(edge: DeviceEdge, nodes: Map<string, GraphNode>): void {
  const producer = requireNode(nodes, edge.sourceId, `Device edge "${edge.id}"`);
  if (producer.kind === "flow") {
    // fine
  } else if (producer.kind === "scene") {
    if (producer.parentId !== null) {
      throw new InvalidShowGraphError(
        `Device edge "${edge.id}" starts at a Scene inside a Flow; a nested Scene is reached via its Flow.`,
      );
    }
  } else {
    throw new InvalidShowGraphError(
      `Device edge "${edge.id}" starts at a ${producer.kind}; only a Flow or top-level Scene drives a Device.`,
    );
  }
  const consumer = requireNode(nodes, edge.targetId, `Device edge "${edge.id}"`);
  if (consumer.kind !== "device") {
    throw new InvalidShowGraphError(`Device edge "${edge.id}" must end at a Device.`);
  }
}

/**
 * Rejects duplicated edges. Navigate edges may run in parallel between the
 * same pair of Scenes, but only one per distinct Cue/Action pairing (#20);
 * for the other two kinds, a second identical edge says nothing new.
 */
function assertNoDuplicateEdges(edges: GraphEdge[]): void {
  const seen = new Set<string>();
  for (const edge of edges) {
    const discriminator =
      edge.kind === "navigate"
        ? `${edge.cueId ?? ""} ${edge.actionId ?? ""}`
        : edge.kind === "wiring"
          ? edge.targetVariableId
          : "";
    const key = `${edge.kind} ${edge.sourceId} ${edge.targetId} ${discriminator}`;
    if (seen.has(key)) {
      throw new InvalidShowGraphError(
        edge.kind === "navigate"
          ? `duplicate Navigate edge between "${edge.sourceId}" and "${edge.targetId}" for the same Cue/Action pairing.`
          : `duplicate ${edge.kind} edge between "${edge.sourceId}" and "${edge.targetId}".`,
      );
    }
    seen.add(key);
  }
}

/**
 * Throws `InvalidShowGraphError` unless `graph` is structurally well-formed:
 * ids unique, nesting legal, every edge endpoint of the right kind and in
 * the right place. Run this before a graph reaches storage, so a malformed
 * graph fails at the boundary rather than as a confusing render later.
 *
 * What this does *not* check: fan-in, wiring cycles, and one-target-per-
 * Device — all connection *rules* owned by issue #24.
 */
export function assertValidShowGraph(graph: ShowGraph): ShowGraph {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  assertUniqueIds(
    graph.nodes.map((node) => node.id),
    "node id",
  );
  assertUniqueIds(
    graph.edges.map((edge) => edge.id),
    "edge id",
  );
  assertUniqueIds(
    graph.nodes.flatMap((node) =>
      node.kind === "scene" ? node.variables.map((variable) => variable.id) : [],
    ),
    "Variable id",
  );

  for (const node of graph.nodes) {
    assertFinitePosition(node);
    assertValidNesting(node, nodes);
    if (node.kind === "flow") assertValidDefaultScene(node, nodes);
    if (node.kind === "scene") {
      assertUniqueIds(
        node.variables.map((variable) => variable.name),
        `Variable name on Scene "${node.id}"`,
      );
    }
  }

  for (const edge of graph.edges) {
    switch (edge.kind) {
      case "wiring":
        assertValidWiringEdge(edge, nodes);
        break;
      case "navigate":
        assertValidNavigateEdge(edge, nodes);
        break;
      case "device":
        assertValidDeviceEdge(edge, nodes);
        break;
    }
  }
  assertNoDuplicateEdges(graph.edges);

  return graph;
}
