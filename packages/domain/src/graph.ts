// The Show graph (issue #38): the single unified node graph that is both
// the Scene/Flow state machine and the Show-level wiring graph (PRD.md
// §6.2 — one canvas, not two). See /CONTEXT.md for the vocabulary.
//
// This module defines what a graph *is* and which structures are
// Connection rules are validated here as part of the same graph boundary:
// graph writes and drag validation must not disagree.
//
// Locked decisions this encodes (issues #20, #23, #25, #26, #29):
//
//   - Five node kinds. Variables are *ports on a Scene*, not nodes.
//   - Containment in a Flow is the only representation of both Scene
//     nesting and "Flow-local" placement — there is no `flowLocal` flag
//     anywhere below, by design (#29).
//   - No Flow-in-Flow (#23); Devices are always Show-level peers (#26).
//   - Three edge kinds, all producer → consumer (#20 as corrected by #26).
//     A wiring edge addresses values by *path* at both ends, so it can move
//     one field of a structured Source into one field of a Scene Variable —
//     the Variable target of #20 is the head of that path, not a special
//     case beside it.
//   - Positions are free-form stored data; no auto-layout (#25).
//   - A Show with zero Flows is valid and unremarkable (#25).

import type { Action, Cue, EventBinding, InteractionCollections } from "./interactions";
import { assertValidInteractions, projectNavigateEdges } from "./interactions";
import type { EntityName } from "./id";
import type { Shape, Type } from "./shapes";
import { assertValidShapes, InvalidShapeError } from "./shapes";
import { isWiringConversion, wiringTypesCompatible } from "./wiring-conversion";
import type { WiringConversion } from "./wiring-conversion";
import { typeAtPath } from "./property-values";
import { assertValidBlocks } from "./blocks";
import type { Block } from "./blocks";
export const NODE_KINDS = ["scene", "flow", "source", "transformer", "device"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];
/** Colorways available to every Show node's editor chrome (#316). */
export const FLOW_COLORS = [
  "neutral",
  "red",
  "orange",
  "yellow",
  "green",
  "aqua",
  "blue",
  "purple",
] as const;
/** The shared Show-node color palette. */
export type FlowColor = (typeof FLOW_COLORS)[number];

export function isFlowColor(value: string): value is FlowColor {
  return FLOW_COLORS.includes(value as FlowColor);
}

/** The colorway used when a Show node has no stored color yet (#316). */
export const DEFAULT_FLOW_COLOR: FlowColor = "neutral";

export class InvalidFlowColorError extends Error {
  constructor(value: string) {
    super(`Invalid Show node color: "${value}". Expected one of: ${FLOW_COLORS.join(", ")}.`);
    this.name = "InvalidFlowColorError";
  }
}

export function assertValidFlowColor(value: string): FlowColor {
  if (!isFlowColor(value)) throw new InvalidFlowColorError(value);
  return value;
}

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
/** Authored Flow dimensions; absent means fit the Flow around its children. */
export interface FlowSize {
  width: number;
  height: number;
}

/** Optional authoring defaults for Image Variables (#296). */
export interface SuggestedImageDimensions {
  width: number;
  height: number;
}

/** A named port on a Scene. A wiring edge targets one of these. */
export interface SceneVariable {
  id: string;
  name: string;
  /** Stable lexicographic order key within the owning Scene. */
  rank?: string;
  /** Optional literal default used when no graph value is supplied. */
  defaultValue?: unknown;
  /** The value type for this Variable, when defined (#107). */
  type?: Type | null;
  /** Cover-crop defaults for image authoring; never asset identity. */
  suggestedDimensions?: SuggestedImageDimensions;
}

interface BaseNode {
  id: string;
  name: string;
  position: Position;
  /** Optional editor colorway; absent inherits its Flow's color or neutral. */
  color?: FlowColor;
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
  /** The authored size; absent means fit around the Flow's children. */
  size?: FlowSize;
}

export interface SourceNode extends BaseNode {
  kind: "source";
  type: Type;
}

export interface TransformerNode extends BaseNode {
  kind: "transformer";
  type?: Type | null;
}

export interface DeviceNode extends BaseNode {
  kind: "device";
  /** Always null: a Device is a Show-level endpoint, never inside a Flow. */
  parentId: null;
  /**
   * How many logical instances this Device represents (#45) — *not* how
   * many screens are plugged into it, which is unbounded either way.
   *
   *   - `false` (**shared**, the default): one instance. Every connection
   *     sees identical state, and an Event from any of them is an Event
   *     from *the Device*. A projector, or three laptops sharing one
   *     scorekeeper view.
   *   - `true` (**per-connection**, shown to directors as an *Audience*
   *     Device): one instance per connection. Each phone navigates its
   *     Flow independently and holds its own Flow-local Source values
   *     (#29); Events are anonymous and aggregated.
   *
   * This is the field that decides Event attribution. Directors pick a
   * default at creation and can change it later from the inspector.
   */
  perConnection: boolean;
  /**
   * The Show-level pairing code a physical device joins with (#8), or null
   * before the server has minted one.
   *
   * Null is the normal state of a Device that has just been created: ids
   * are generated client-side (#47) so a node exists before any round
   * trip, but a *unique* code can only be minted where uniqueness is
   * enforceable. The code itself belongs to the Show and outlives any one
   * draft (PRD §4.3) — this field is a read-through copy of it, not where
   * it lives.
   */
  pairingCode: string | null;
}

export type GraphNode = SceneNode | FlowNode | SourceNode | TransformerNode | DeviceNode;

/**
 * A path into a structured value: the field names to walk, outermost
 * first. `[]` addresses the whole value.
 *
 * Paths are what let an edge carry *part* of a value rather than all of
 * it — pulling one field out of a Source holding a Shape (`["voter",
 * "name"]`), or feeding one field of a structured Scene Variable while
 * something else feeds its siblings. Segments are field names only; array
 * indices are deliberately not addressable, because an edge is design-time
 * structure and "the 3rd element" isn't a stable design-time thing to
 * point at.
 */
export type ValuePath = string[];

/** Virtual value handles exposed by Device nodes. */
export const DEVICE_SOURCE_HANDLES = {
  qrCode: "qr-code",
  pairingCode: "pairing-code",
} as const;

export type DeviceSourceHandle = (typeof DEVICE_SOURCE_HANDLES)[keyof typeof DEVICE_SOURCE_HANDLES];

export function deviceSourceType(handle: string | null | undefined): Type | null {
  if (handle === DEVICE_SOURCE_HANDLES.qrCode) return "image";
  if (handle === DEVICE_SOURCE_HANDLES.pairingCode) return "text";
  return null;
}

/**
 * Authored edge layout: how far the user has dragged each of an edge's
 * draggable runs from where routing would have put it, in canvas units.
 *
 * The outer key is the *shape* of the route the nudges were placed on — a
 * string like `"HVH"` naming each run's orientation in order — and the inner
 * key is the index of the run within it. Keying by shape rather than by index
 * alone is what makes the layout survive the graph moving underneath it: an
 * index into a route of a different shape means nothing, so a route that
 * changes shape leaves the nudges dormant rather than applying them somewhere
 * absurd, and a route that changes back picks them up again (#475).
 */
export type EdgeLayout = Record<string, Record<string, number>>;

interface BaseEdge {
  id: string;
  sourceId: string;
  targetId: string;
  /**
   * Which part of the producer's value travels down this edge. Empty for
   * the whole value.
   */
  sourcePath: ValuePath;
  /**
   * Which part of the consumer this edge feeds. Empty for edges that don't
   * address a value at all; for a wiring edge, the first segment is the id
   * of the Scene Variable being fed and any further segments name a field
   * within it.
   */
  targetPath: ValuePath;
  /**
   * Where the author has dragged this edge's runs, if anywhere. Absent means
   * "wherever routing puts it", which is what almost every edge says.
   */
  layout?: EdgeLayout;
}

/**
 * Source | Transformer output → a Transformer input or a named Variable
 * handle on a Scene. `targetPath[0]` is the Variable id for Scene targets;
 * Transformer inputs are currently unnamed and use an empty path.
 */
export interface WiringEdge extends BaseEdge {
  kind: "wiring";
  /** Stable source-field id → target-field id mapping resolved at connection time. */
  fieldMapping?: Record<string, string>;
  /**
   * The conversion this edge performs on the producer value before the
   * ordinary compatibility and coercion rules apply — `"firstItem"` for the
   * positional array-to-single wiring of #532.
   *
   * Recorded on the edge rather than inferred at each end, so every reader
   * (validation, the editor's affordances, the runtime, a published graph, a
   * Run snapshot) sees the same declared conversion instead of re-deriving
   * one and possibly disagreeing.
   */
  conversion?: WiringConversion;
}

/**
 * Scene → Scene inside one Flow. Parallel edges are allowed, one per
 * distinct Cue/Action pairing, so the canvas shows *why* a transition
 * exists (#20). Cues and Actions aren't modelled yet, so the pairing is
 * carried as opaque ids that are null until they are.
 */
export interface NavigateEdge extends BaseEdge {
  kind: "navigate";
  cueId: string | null;
  actionId: string | null;
}

/**
 * Flow | top-level Scene → Device: "this Device displays whatever's here."
 *
 * The consumer's `perConnection` decides how many times what's at the
 * producer end is instantiated: a shared Device drives one instance of
 * that Flow, a per-connection Device drives one per connected phone (#45).
 * Nothing here enforces that — it's the reading #29 will build Flow-local
 * Source scoping on, recorded so that ticket inherits the meaning rather
 * than re-deciding it.
 */
export interface DeviceEdge extends BaseEdge {
  kind: "device";
}

export type GraphEdge = WiringEdge | NavigateEdge | DeviceEdge;

/**
 * The Scene Variable a wiring edge lands on — the head of its target path.
 * Use this rather than reaching for `targetPath[0]` at call sites, so
 * "the first segment is the Variable" is stated in one place.
 */
export function wiringTargetVariableId(edge: WiringEdge): string {
  const [variableId] = edge.targetPath;
  if (variableId === undefined) {
    throw new InvalidShowGraphError(
      "emptyTargetPath",
      `wiring edge "${edge.id}" has an empty target path.`,
    );
  }
  return variableId;
}

/** Renders a path for display or comparison: `["a","b"]` → `"a.b"`. */
export function formatValuePath(path: ValuePath): string {
  return path.join(".");
}

/** A graph-owned sparse Source default. */
export interface SourceFieldDefault {
  nodeId: string;
  fieldPath: string[];
  value: unknown;
}

/** A whole Show graph in one state (draft or published). */
export interface ShowGraph {
  /** Show-scoped type definitions, independent of the canvas node graph. */
  shapes?: Shape[];
  /** Sparse per-Source overrides; absence inherits the Shape default (#107). */
  sourceFieldDefaults?: SourceFieldDefault[];
  /** Show-owned reusable Block definitions, separate from graph nodes. */
  blocks?: Block[];
  /** Graph-scoped authored interaction definitions. */
  cues?: readonly Cue[];
  actions?: readonly Action[];
  eventBindings?: readonly EventBinding[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** The empty graph a Show starts life with. Valid — zero Flows is fine (#25). */
export function emptyShowGraph(): ShowGraph {
  return { shapes: [], nodes: [], edges: [], cues: [], actions: [], eventBindings: [] };
}

export type GraphViolation =
  | "invalidShape"
  | "emptyTargetPath"
  | "invalidImageVariableType"
  | "invalidImageDimensions"
  | "missingNode"
  | "duplicateId"
  | "nonFinitePosition"
  | "flowNested"
  | "deviceNested"
  | "invalidParent"
  | "invalidDefaultScene"
  | "emptyPathSegment"
  | "valuePathOnNonWiring"
  | "invalidWiringSource"
  | "invalidDeviceSourceHandle"
  | "missingSourceField"
  | "invalidWiringTarget"
  | "missingTransformerField"
  | "sourceInputPath"
  | "missingVariable"
  | "incompatibleTypes"
  | "invalidWiringConversion"
  | "flowLocalEscape"
  | "invalidNavigateEndpoints"
  | "crossFlowNavigate"
  | "nestedSceneDrivesDevice"
  | "invalidDeviceSource"
  | "invalidDeviceTarget"
  | "duplicateEdge"
  | "wiringFanIn"
  | "deviceHasDriver"
  | "wiringCycle"
  | "missingSourceType"
  | "invalidNodeColor"
  | "invalidNavigateProjection";

export class InvalidShowGraphError extends Error {
  readonly reason: GraphViolation;

  constructor(reason: GraphViolation, detail: string) {
    super(`Invalid Show graph: ${detail}`);
    this.name = "InvalidShowGraphError";
    this.reason = reason;
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

/**
 * How many logical instances a Device stands for — `"one"` for a shared
 * Device, `"perConnection"` for an Audience one (#45).
 *
 * A named reading of the boolean, so that call sites say what they mean
 * and the two words exist in one place for #29 to build on.
 */
export function deviceInstanceCardinality(device: DeviceNode): "one" | "perConnection" {
  return device.perConnection ? "perConnection" : "one";
}

function assertImageVariableMetadata(variable: SceneVariable, sceneId: string): void {
  if (variable.suggestedDimensions === undefined) return;
  if (variable.type !== "image") {
    throw new InvalidShowGraphError(
      "invalidImageVariableType",
      `Variable "${variable.id}" on Scene "${sceneId}" can only have suggested image dimensions when its Type is image.`,
    );
  }
  const { width, height } = variable.suggestedDimensions;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 8000 ||
    height > 8000
  ) {
    throw new InvalidShowGraphError(
      "invalidImageDimensions",
      `Variable "${variable.id}" has invalid suggested image dimensions; both axes must be integer pixels from 1 through 8000.`,
    );
  }
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
    throw new InvalidShowGraphError(
      "missingNode",
      `${role} references node "${id}", which isn't in the graph.`,
    );
  }
  return node;
}

function assertUniqueIds(ids: Iterable<string>, what: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new InvalidShowGraphError("duplicateId", `duplicate ${what} "${id}".`);
    }
    seen.add(id);
  }
}

function assertFinitePosition(node: GraphNode): void {
  if (!Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) {
    throw new InvalidShowGraphError(
      "nonFinitePosition",
      `node "${node.id}" has a non-finite position.`,
    );
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
    throw new InvalidShowGraphError(
      "flowNested",
      `Flow "${node.id}" is nested inside another node.`,
    );
  }
  if (node.kind === "device") {
    throw new InvalidShowGraphError("deviceNested", `Device "${node.id}" is nested inside a Flow.`);
  }
  const parent = requireNode(nodes, parentId, `Node "${node.id}"`);
  if (parent.kind !== "flow") {
    throw new InvalidShowGraphError(
      "invalidParent",
      `node "${node.id}" is nested inside "${parent.id}", which is a ${parent.kind}, not a Flow.`,
    );
  }
}

function assertValidDefaultScene(flow: FlowNode, nodes: Map<string, GraphNode>): void {
  if (flow.defaultSceneId === null) return;
  const scene = requireNode(nodes, flow.defaultSceneId, `Flow "${flow.id}"'s default Scene`);
  if (scene.kind !== "scene" || scene.parentId !== flow.id) {
    throw new InvalidShowGraphError(
      "invalidDefaultScene",
      `Flow "${flow.id}"'s default Scene must be a Scene inside that Flow.`,
    );
  }
}

function assertValidPathSegments(edge: GraphEdge): void {
  for (const [name, path] of [
    ["source", edge.sourcePath],
    ["target", edge.targetPath],
  ] as const) {
    if (path.some((segment) => segment.length === 0)) {
      throw new InvalidShowGraphError(
        "emptyPathSegment",
        `edge "${edge.id}" has an empty segment in its ${name} path.`,
      );
    }
  }
}

/**
 * Navigate and Device edges carry a Scene or a whole display, not a value,
 * so there's nothing for a path to address. Keeping the fields on every
 * edge (rather than only on wiring edges) is what lets the canvas treat
 * edges uniformly; keeping them empty here is what stops that uniformity
 * turning into meaningless data.
 */
function assertNoPaths(edge: NavigateEdge | DeviceEdge): void {
  if (edge.sourcePath.length > 0 || edge.targetPath.length > 0) {
    throw new InvalidShowGraphError(
      "valuePathOnNonWiring",
      `${edge.kind === "navigate" ? "Navigate" : "Device"} edge "${edge.id}" carries a value path; only wiring edges address values.`,
    );
  }
}

function assertValidWiringEdge(
  edge: WiringEdge,
  nodes: Map<string, GraphNode>,
  shapes: readonly Shape[],
): void {
  const producer = requireNode(nodes, edge.sourceId, `Wiring edge "${edge.id}"`);
  const wholeProducerType =
    producer.kind === "source" || producer.kind === "transformer" ? producer.type : null;
  const sourceType =
    producer.kind === "device"
      ? deviceSourceType(edge.sourcePath[0])
      : wholeProducerType && edge.sourcePath.length > 0
        ? typeAtPath(wholeProducerType, edge.sourcePath, shapes)
        : wholeProducerType;
  if (
    producer.kind !== "source" &&
    producer.kind !== "transformer" &&
    (producer.kind !== "device" || sourceType === null)
  ) {
    throw new InvalidShowGraphError(
      "invalidWiringSource",
      `wiring edge "${edge.id}" starts at a ${producer.kind}; only a Source, Transformer, or virtual Device source produces data.`,
    );
  }
  if (producer.kind === "device" && edge.sourcePath.length !== 1) {
    throw new InvalidShowGraphError(
      "invalidDeviceSourceHandle",
      `wiring edge "${edge.id}" must name one virtual Device source handle.`,
    );
  }
  if (
    (producer.kind === "source" || producer.kind === "transformer") &&
    wholeProducerType &&
    edge.sourcePath.length > 0 &&
    sourceType === null
  ) {
    throw new InvalidShowGraphError(
      "missingSourceField",
      `wiring edge "${edge.id}" names a Source or Transformer field that does not exist.`,
    );
  }
  const consumer = requireNode(nodes, edge.targetId, `Wiring edge "${edge.id}"`);
  if (consumer.kind !== "scene" && consumer.kind !== "transformer" && consumer.kind !== "source") {
    throw new InvalidShowGraphError(
      "invalidWiringTarget",
      `wiring edge "${edge.id}" targets a ${consumer.kind}; wiring targets a Source, Transformer, or Variable on a Scene.`,
    );
  }
  let targetType: Type | null = null;
  if (consumer.kind === "transformer") {
    targetType =
      consumer.type && edge.targetPath.length > 0
        ? typeAtPath(consumer.type, edge.targetPath, shapes)
        : (consumer.type ?? null);
    if (consumer.type && edge.targetPath.length > 0 && targetType === null) {
      throw new InvalidShowGraphError(
        "missingTransformerField",
        `wiring edge "${edge.id}" targets a Transformer field that does not exist.`,
      );
    }
  } else if (consumer.kind === "source") {
    if (edge.targetPath.length > 0) {
      throw new InvalidShowGraphError(
        "sourceInputPath",
        `wiring edge "${edge.id}" targets a Source field; Source inputs are not named.`,
      );
    }
    targetType = consumer.type;
  } else {
    if (edge.targetPath.length === 0) {
      throw new InvalidShowGraphError(
        "emptyTargetPath",
        `wiring edge "${edge.id}" has an empty target path; it must at least name the Scene Variable it feeds.`,
      );
    }
    const variableId = wiringTargetVariableId(edge);
    const variable = consumer.variables.find((candidate) => candidate.id === variableId);
    if (!variable) {
      throw new InvalidShowGraphError(
        "missingVariable",
        `wiring edge "${edge.id}" targets Variable "${variableId}", which Scene "${consumer.id}" doesn't have.`,
      );
    }
    targetType = variable.type ? typeAtPath(variable.type, edge.targetPath.slice(1), shapes) : null;
  }
  if (edge.conversion !== undefined && !isWiringConversion(edge.conversion)) {
    throw new InvalidShowGraphError(
      "invalidWiringConversion",
      `wiring edge "${edge.id}" declares an unknown conversion "${String(edge.conversion)}".`,
    );
  }
  if (
    sourceType &&
    targetType &&
    !wiringTypesCompatible(sourceType, targetType, edge.conversion, shapes)
  ) {
    // A declared conversion that doesn't apply is its own violation: the edge
    // is not merely mistyped, it is claiming to do something it can't.
    throw new InvalidShowGraphError(
      edge.conversion ? "invalidWiringConversion" : "incompatibleTypes",
      edge.conversion
        ? `wiring edge "${edge.id}" declares a ${edge.conversion} conversion that does not apply to its endpoints.`
        : `wiring edge "${edge.id}" connects incompatible types; no supported coercion exists.`,
    );
  }
  if (producer.parentId !== null && producer.parentId !== consumer.parentId) {
    throw new InvalidShowGraphError(
      "flowLocalEscape",
      `wiring edge "${edge.id}" feeds a Flow-local ${producer.kind} into a node outside its Flow.`,
    );
  }
}

function assertValidNavigateEdge(edge: NavigateEdge, nodes: Map<string, GraphNode>): void {
  const from = requireNode(nodes, edge.sourceId, `Navigate edge "${edge.id}"`);
  const to = requireNode(nodes, edge.targetId, `Navigate edge "${edge.id}"`);
  if (from.kind !== "scene" || to.kind !== "scene") {
    throw new InvalidShowGraphError(
      "invalidNavigateEndpoints",
      `Navigate edge "${edge.id}" must run from a Scene to a Scene.`,
    );
  }
  // A Flow *is* the state machine, so a Navigate edge only means anything
  // inside one, and never across two (each Flow is siloed — #19, #25).
  if (from.parentId === null || from.parentId !== to.parentId) {
    throw new InvalidShowGraphError(
      "crossFlowNavigate",
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
        "nestedSceneDrivesDevice",
        `Device edge "${edge.id}" starts at a Scene inside a Flow; a nested Scene is reached via its Flow.`,
      );
    }
  } else {
    throw new InvalidShowGraphError(
      "invalidDeviceSource",
      `Device edge "${edge.id}" starts at a ${producer.kind}; only a Flow or top-level Scene drives a Device.`,
    );
  }
  const consumer = requireNode(nodes, edge.targetId, `Device edge "${edge.id}"`);
  if (consumer.kind !== "device") {
    throw new InvalidShowGraphError(
      "invalidDeviceTarget",
      `Device edge "${edge.id}" must end at a Device.`,
    );
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
        ? `${edge.cueId ?? ""}${edge.actionId ?? ""}`
        : // Two wiring edges between the same pair of nodes are distinct if
          // they move different fields: feeding a Scene Variable's `name`
          // and `score` from two fields of one Source is two edges, not a
          // duplicate.
          `${formatValuePath(edge.sourcePath)} > ${formatValuePath(edge.targetPath)}`;
    const key = `${edge.kind}${edge.sourceId}${edge.targetId}${discriminator}`;
    if (seen.has(key)) {
      throw new InvalidShowGraphError(
        "duplicateEdge",
        edge.kind === "navigate"
          ? `duplicate Navigate edge between "${edge.sourceId}" and "${edge.targetId}" for the same Cue/Action pairing.`
          : `duplicate ${edge.kind} edge between "${edge.sourceId}" and "${edge.targetId}".`,
      );
    }
    seen.add(key);
  }
}

function isPathPrefix(prefix: string[], path: string[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => segment === path[index]);
}

/** A target path and one of its descendants cannot both have producers. */
function assertNoWiringFanIn(edges: GraphEdge[], nodes: Map<string, GraphNode>): void {
  const wiring = edges.filter(
    (edge): edge is WiringEdge =>
      edge.kind === "wiring" &&
      (nodes.get(edge.targetId)?.kind !== "transformer" || edge.targetPath.length > 0),
  );
  for (let i = 0; i < wiring.length; i += 1) {
    const left = wiring[i];
    if (!left) continue;
    for (let j = i + 1; j < wiring.length; j += 1) {
      const right = wiring[j];
      if (!right) continue;
      if (left.targetId !== right.targetId) continue;
      if (left.targetPath[0] !== right.targetPath[0]) continue;
      const target = nodes.get(left.targetId);
      if (
        target?.kind === "source" &&
        typeof target.type !== "string" &&
        target.type.kind === "array" &&
        left.targetPath.length === 0 &&
        right.targetPath.length === 0
      ) {
        continue;
      }
      if (
        !isPathPrefix(left.targetPath, right.targetPath) &&
        !isPathPrefix(right.targetPath, left.targetPath)
      ) {
        continue;
      }
      throw new InvalidShowGraphError(
        "wiringFanIn",
        `wiring edges "${left.id}" and "${right.id}" both feed overlapping paths on Variable "${left.targetPath[0]}".`,
      );
    }
  }
}

function assertOneDriverPerDevice(edges: GraphEdge[]): void {
  const drivers = new Map<string, string>();
  for (const edge of edges) {
    if (edge.kind !== "device") continue;
    const previous = drivers.get(edge.targetId);
    if (previous) {
      throw new InvalidShowGraphError(
        "deviceHasDriver",
        `Device "${edge.targetId}" has more than one driver (edges "${previous}" and "${edge.id}").`,
      );
    }
    drivers.set(edge.targetId, edge.id);
  }
}

function assertNoWiringCycles(edges: GraphEdge[]): void {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind !== "wiring") continue;
    outgoing.set(edge.sourceId, [...(outgoing.get(edge.sourceId) ?? []), edge.targetId]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) {
      throw new InvalidShowGraphError(
        "wiringCycle",
        `wiring edges form a cycle at node "${nodeId}".`,
      );
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const targetId of outgoing.get(nodeId) ?? []) visit(targetId);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const nodeId of outgoing.keys()) visit(nodeId);
}

function assertNavigateProjection(graph: ShowGraph, interactions: InteractionCollections): void {
  if (interactions.actions.length === 0) return;
  const expected = projectNavigateEdges(graph);
  const actual = graph.edges.filter((edge) => edge.kind === "navigate");
  if (
    actual.length !== expected.length ||
    expected.some((edge) => {
      const candidate = actual.find((current) => current.id === edge.id);
      return (
        candidate === undefined ||
        candidate.sourceId !== edge.sourceId ||
        candidate.targetId !== edge.targetId ||
        candidate.cueId !== edge.cueId ||
        candidate.actionId !== edge.actionId
      );
    })
  ) {
    throw new InvalidShowGraphError(
      "invalidNavigateProjection",
      "Navigate edges must be the materialized projection of the interaction Actions.",
    );
  }
}

/**
 * Throws `InvalidShowGraphError` unless `graph` is structurally well-formed:
 * ids unique, nesting legal, every edge endpoint of the right kind and in
 * the right place. Run this before a graph reaches storage, so a malformed
 * graph fails at the boundary rather than as a confusing render later.
 *
 * Connection rules are checked here as part of the same boundary: a Scene
 * Variable path has one producer, wiring cannot cycle, and a Device has one
 * driver. Keeping these checks here means graph writes and drag validation
 * cannot disagree.
 */
export function assertValidShowGraph(graph: ShowGraph): ShowGraph {
  assertValidBlocks(graph.blocks, graph.shapes ?? []);
  try {
    assertValidShapes(graph.shapes ?? []);
  } catch (error) {
    if (error instanceof InvalidShapeError) {
      throw new InvalidShowGraphError("invalidShape", error.message);
    }
    throw error;
  }
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
    if (node.kind === "source" && !node.type) {
      throw new InvalidShowGraphError("missingSourceType", `Source "${node.id}" must have a Type.`);
    }
    assertFinitePosition(node);
    assertValidNesting(node, nodes);
    if (node.color !== undefined && !isFlowColor(node.color)) {
      throw new InvalidShowGraphError(
        "invalidNodeColor",
        `Node "${node.id}" has an invalid color.`,
      );
    }
    if (node.kind === "flow") {
      assertValidDefaultScene(node, nodes);
    }
    if (node.kind === "scene") {
      assertUniqueIds(
        node.variables.map((variable) => variable.name),
        `Variable name on Scene "${node.id}"`,
      );
      for (const variable of node.variables) assertImageVariableMetadata(variable, node.id);
    }
  }
  const interactions = assertValidInteractions(graph);
  assertNavigateProjection(graph, interactions);

  for (const edge of graph.edges) {
    assertValidPathSegments(edge);
    switch (edge.kind) {
      case "wiring":
        assertValidWiringEdge(edge, nodes, graph.shapes ?? []);
        break;
      case "navigate":
        assertNoPaths(edge);
        assertValidNavigateEdge(edge, nodes);
        break;
      case "device":
        assertNoPaths(edge);
        assertValidDeviceEdge(edge, nodes);
        break;
    }
  }
  assertNoDuplicateEdges(graph.edges);
  assertNoWiringFanIn(graph.edges, nodes);
  assertNoWiringCycles(graph.edges);
  assertOneDriverPerDevice(graph.edges);

  return graph;
}
