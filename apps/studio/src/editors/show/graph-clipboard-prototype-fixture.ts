// Throwaway (#875): static Shows plus pure fragment helpers for the graph
// clipboard gesture prototype. Not a codec, reconciler or capture contract —
// the resolved planning tickets own those. Positions, ids and outcomes here are
// only rich enough to make the gestures feel real on the Show Editor canvas.
import type { GraphEdge, GraphNode, Position, ShowGraph } from "@mechane/domain/graph";

import { SAMPLE_GRAPH } from "./data/sample-graph";

export type ShowKey = "hamlet" | "tempest";

export interface PrototypeShow {
  key: ShowKey;
  name: string;
  graph: ShowGraph;
}

const TEMPEST: ShowGraph = {
  nodes: [
    {
      id: "flow_storm",
      kind: "flow",
      name: "Storm at sea",
      parentId: null,
      defaultSceneId: "scene_shipwreck",
      position: { x: 0, y: 0 },
    },
    {
      id: "scene_shipwreck",
      kind: "scene",
      name: "Shipwreck",
      parentId: "flow_storm",
      position: { x: 32, y: 64 },
      variables: [{ id: "variable_caption", name: "caption", type: null }],
    },
    {
      id: "scene_island",
      kind: "scene",
      name: "The island",
      parentId: "flow_storm",
      position: { x: 296, y: 64 },
      variables: [],
    },
    {
      id: "source_weather",
      kind: "source",
      name: "Weather",
      parentId: null,
      position: { x: 40, y: 340 },
      type: "text",
    },
    {
      id: "device_stage",
      kind: "device",
      name: "Stage screen",
      parentId: null,
      position: { x: 720, y: 120 },
      perConnection: false,
      pairingCode: "T3MPS",
    },
  ],
  edges: [
    {
      id: "edge_wash_ashore",
      kind: "navigate",
      sourceId: "scene_shipwreck",
      targetId: "scene_island",
      sourcePath: [],
      targetPath: [],
      cueId: null,
      actionId: null,
    },
    {
      id: "edge_weather_caption",
      kind: "wiring",
      sourceId: "source_weather",
      targetId: "scene_shipwreck",
      sourcePath: [],
      targetPath: ["variable_caption"],
    },
    {
      id: "edge_stage",
      kind: "device",
      sourceId: "flow_storm",
      targetId: "device_stage",
      sourcePath: [],
      targetPath: [],
    },
  ],
};

export const PROTOTYPE_SHOWS: Record<ShowKey, PrototypeShow> = {
  hamlet: { key: "hamlet", name: "Hamlet", graph: { ...SAMPLE_GRAPH } },
  tempest: { key: "tempest", name: "The Tempest", graph: TEMPEST },
};

export function isShowKey(value: string | null): value is ShowKey {
  return value === "hamlet" || value === "tempest";
}

/** The illustrative portable payload. The real codec is decided elsewhere. */
export interface GraphSnapshot {
  format: "mechane/show-graph";
  version: 1;
  source: { show: ShowKey; showName: string; revision: number };
  nodes: GraphNode[];
  edges: GraphEdge[];
  boundary: GraphEdge[];
  absolute: Record<string, Position>;
  cutIntentId: string | null;
}

export function isGraphSnapshot(value: unknown): value is GraphSnapshot {
  if (typeof value !== "object" || value === null) return false;
  return (
    "format" in value &&
    value.format === "mechane/show-graph" &&
    "version" in value &&
    value.version === 1 &&
    "nodes" in value &&
    Array.isArray(value.nodes) &&
    "edges" in value &&
    Array.isArray(value.edges) &&
    "boundary" in value &&
    Array.isArray(value.boundary) &&
    "source" in value &&
    typeof value.source === "object"
  );
}

function byId(graph: ShowGraph): Map<string, GraphNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

export function absolutePositionOf(graph: ShowGraph, node: GraphNode): Position {
  if (!node.parentId) return node.position;
  const parent = byId(graph).get(node.parentId);
  if (!parent) return node.position;
  return { x: parent.position.x + node.position.x, y: parent.position.y + node.position.y };
}

/** Selected roots plus every child of a selected Flow, each once. */
export function captureClosure(graph: ShowGraph, selectedIds: readonly string[]): Set<string> {
  const closure = new Set(selectedIds.filter((id) => graph.nodes.some((node) => node.id === id)));
  for (const node of graph.nodes) {
    if (node.parentId && closure.has(node.parentId)) closure.add(node.id);
  }
  return closure;
}

export function captureSnapshot({
  graph,
  selectedIds,
  show,
  revision,
}: {
  graph: ShowGraph;
  selectedIds: readonly string[];
  show: PrototypeShow;
  revision: number;
}): GraphSnapshot {
  const closure = captureClosure(graph, selectedIds);
  const nodes = graph.nodes.filter((node) => closure.has(node.id));
  const absolute: Record<string, Position> = {};
  for (const node of nodes) absolute[node.id] = absolutePositionOf(graph, node);
  return {
    format: "mechane/show-graph",
    version: 1,
    source: { show: show.key, showName: show.name, revision },
    nodes,
    edges: graph.edges.filter((edge) => closure.has(edge.sourceId) && closure.has(edge.targetId)),
    boundary: graph.edges.filter(
      (edge) => closure.has(edge.sourceId) !== closure.has(edge.targetId),
    ),
    absolute,
    cutIntentId: null,
  };
}

export function snapshotSummary(snapshot: GraphSnapshot): string {
  const count = snapshot.nodes.length;
  const roots = topLevelNodes(snapshot);
  const first = roots[0];
  if (roots.length === 1 && first) {
    return count === 1 ? `“${first.name}”` : `“${first.name}” and ${count - 1} inside it`;
  }
  return `${count} nodes`;
}

function topLevelNodes(snapshot: GraphSnapshot): GraphNode[] {
  const ids = new Set(snapshot.nodes.map((node) => node.id));
  return snapshot.nodes.filter((node) => !node.parentId || !ids.has(node.parentId));
}

function nextName(existing: ReadonlySet<string>, base: string): string {
  if (!existing.has(base)) return base;
  const copy = `${base} copy`;
  if (!existing.has(copy)) return copy;
  let suffix = 2;
  while (existing.has(`${copy}${suffix}`)) suffix += 1;
  return `${copy}${suffix}`;
}

let sequence = 0;
function freshId(prefix: string): string {
  sequence += 1;
  return `${prefix}_p875_${Date.now().toString(36)}${sequence}`;
}

export type ContainmentReason =
  | "explicit-flow"
  | "explicit-show-level"
  | "original-parent"
  | "show-level"
  | "whole-flow";

export interface PasteTarget {
  /** Where the fragment's top-left lands, in flow coordinates. */
  at: Position;
  /** A Flow chosen by the gesture (pointer, menu point, ghost), or null for Show level. */
  explicitFlowId: string | null | undefined;
}

export interface RequiredRepair {
  owner: string;
  target: string;
  reason: string;
}

export interface DisconnectedInput {
  consumer: string;
  producer: string;
}

export interface PastePlan {
  kind: "copy";
  nodes: GraphNode[];
  edges: GraphEdge[];
  topLevelIds: string[];
  containerName: string | null;
  containment: ContainmentReason;
  reconnected: number;
  disconnected: DisconnectedInput[];
  repairs: RequiredRepair[];
}

const FLOW_ELIGIBLE = new Set<GraphNode["kind"]>(["scene", "source", "transformer"]);

function nodeName(graph: ShowGraph, id: string): string {
  return graph.nodes.find((node) => node.id === id)?.name ?? "an unavailable node";
}

export function planPaste({
  snapshot,
  destination,
  graph,
  target,
}: {
  snapshot: GraphSnapshot;
  destination: ShowKey;
  graph: ShowGraph;
  target: PasteTarget;
}): PastePlan {
  const sameShow = snapshot.source.show === destination;
  const nodesById = byId(graph);
  const closure = new Set(snapshot.nodes.map((node) => node.id));
  const roots = topLevelNodes(snapshot);
  const flowEligible = roots.every((node) => FLOW_ELIGIBLE.has(node.kind));
  const explicitFlow =
    target.explicitFlowId === undefined || target.explicitFlowId === null
      ? null
      : (nodesById.get(target.explicitFlowId) ?? null);

  let containment: ContainmentReason;
  if (!flowEligible) containment = "whole-flow";
  else if (explicitFlow) containment = "explicit-flow";
  else if (target.explicitFlowId === null) containment = "explicit-show-level";
  else if (sameShow && roots.some((node) => node.parentId && nodesById.has(node.parentId)))
    containment = "original-parent";
  else containment = "show-level";

  const origin = roots.reduce(
    (min, node) => {
      const position = snapshot.absolute[node.id] ?? node.position;
      return { x: Math.min(min.x, position.x), y: Math.min(min.y, position.y) };
    },
    { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY },
  );

  const idMap = new Map<string, string>();
  const variableMap = new Map<string, string>();
  for (const node of snapshot.nodes) idMap.set(node.id, freshId(node.kind));
  const names = new Set(graph.nodes.map((node) => node.name));

  const nodes: GraphNode[] = snapshot.nodes.map((node) => {
    const id = idMap.get(node.id) ?? freshId(node.kind);
    const name = nextName(names, node.name);
    names.add(name);
    const isRoot = !node.parentId || !closure.has(node.parentId);
    const absolute = snapshot.absolute[node.id] ?? node.position;
    const landed = {
      x: Math.round(target.at.x + (absolute.x - origin.x)),
      y: Math.round(target.at.y + (absolute.y - origin.y)),
    };
    let parentId: string | null = node.parentId ? (idMap.get(node.parentId) ?? null) : null;
    let position = node.position;
    if (isRoot) {
      parentId = null;
      position = landed;
      if (containment === "explicit-flow" && explicitFlow) {
        parentId = explicitFlow.id;
        position = { x: landed.x - explicitFlow.position.x, y: landed.y - explicitFlow.position.y };
      } else if (containment === "original-parent" && node.parentId) {
        const parent = nodesById.get(node.parentId);
        if (parent) {
          parentId = parent.id;
          position = { x: landed.x - parent.position.x, y: landed.y - parent.position.y };
        }
      }
    }
    switch (node.kind) {
      case "scene": {
        const variables = node.variables.map((variable) => {
          const fresh = freshId("variable");
          variableMap.set(variable.id, fresh);
          return { ...variable, id: fresh };
        });
        return { ...node, id, name, parentId, position, variables };
      }
      case "flow":
        return {
          ...node,
          id,
          name,
          parentId: null,
          position,
          defaultSceneId: node.defaultSceneId ? (idMap.get(node.defaultSceneId) ?? null) : null,
        };
      case "device":
        return { ...node, id, name, parentId: null, position, pairingCode: null };
      case "source":
      case "transformer":
        return { ...node, id, name, parentId, position };
      default: {
        const _exhaustive: never = node;
        return _exhaustive;
      }
    }
  });

  const remapPath = (path: readonly string[]): string[] =>
    path.map((segment, index) => (index === 0 ? (variableMap.get(segment) ?? segment) : segment));
  const copyEdge = (edge: GraphEdge, sourceId: string, targetId: string): GraphEdge => {
    const id = freshId("edge");
    switch (edge.kind) {
      case "navigate":
        return { ...edge, id, sourceId, targetId, cueId: null, actionId: null };
      case "wiring":
        return { ...edge, id, sourceId, targetId, targetPath: remapPath(edge.targetPath) };
      case "update":
        return { ...edge, id, sourceId, targetId };
      case "device":
        return { ...edge, id, sourceId, targetId };
      default: {
        const _exhaustive: never = edge;
        return _exhaustive;
      }
    }
  };

  const edges: GraphEdge[] = [];
  for (const edge of snapshot.edges) {
    const sourceId = idMap.get(edge.sourceId);
    const targetId = idMap.get(edge.targetId);
    if (sourceId && targetId) edges.push(copyEdge(edge, sourceId, targetId));
  }

  const parentOfCopy = new Map(nodes.map((node) => [node.id, node.parentId]));
  let reconnected = 0;
  const disconnected: DisconnectedInput[] = [];
  const repairs: RequiredRepair[] = [];
  for (const edge of snapshot.boundary) {
    const copiedSource = idMap.get(edge.sourceId);
    const copiedTarget = idMap.get(edge.targetId);
    if (edge.kind === "navigate" || edge.kind === "update") {
      // A copied Scene's own Action pointing outside the copied content.
      if (!copiedSource) continue;
      const owner =
        snapshot.nodes.find((node) => node.id === edge.sourceId)?.name ?? "A copied Scene";
      const original = nodesById.get(edge.targetId);
      if (!sameShow || !original) {
        repairs.push({
          owner,
          target: sameShow ? "an unavailable target" : `a ${snapshot.source.showName} node`,
          reason: sameShow
            ? "The original target no longer exists."
            : "Targets in another Show need an explicit destination mapping.",
        });
        continue;
      }
      if (edge.kind === "navigate" && original.parentId !== parentOfCopy.get(copiedSource)) {
        repairs.push({
          owner,
          target: original.name,
          reason: "Navigate targets must be in the same Flow as the pasted Scene.",
        });
        continue;
      }
      edges.push(copyEdge(edge, copiedSource, edge.targetId));
      reconnected += 1;
      continue;
    }
    // Inputs and Device drivers feeding copied content from outside it.
    if (!copiedTarget) continue;
    const producer = nodesById.get(edge.sourceId);
    if (sameShow && producer) {
      edges.push(copyEdge(edge, edge.sourceId, copiedTarget));
      reconnected += 1;
    } else {
      disconnected.push({
        consumer: snapshot.nodes.find((node) => node.id === edge.targetId)?.name ?? "A copied node",
        producer: sameShow ? "an unavailable producer" : `a ${snapshot.source.showName} node`,
      });
    }
  }

  const containerName =
    containment === "explicit-flow" && explicitFlow
      ? explicitFlow.name
      : containment === "original-parent"
        ? (roots
            .map((node) => (node.parentId ? nodesById.get(node.parentId)?.name : undefined))
            .find(Boolean) ?? null)
        : null;

  return {
    kind: "copy",
    nodes,
    edges,
    topLevelIds: roots.map((node) => idMap.get(node.id) ?? node.id),
    containerName,
    containment,
    reconnected,
    disconnected,
    repairs,
  };
}

export interface MovePlan {
  kind: "move";
  nodeIds: string[];
  moves: { nodeId: string; parentId: string | null; position: Position; reparent: boolean }[];
  containerName: string | null;
  containment: ContainmentReason;
  blockers: RequiredRepair[];
}

/** A verified same-Show move: the existing identities change place, nothing is recreated. */
export function planMove({
  snapshot,
  graph,
  target,
}: {
  snapshot: GraphSnapshot;
  graph: ShowGraph;
  target: PasteTarget;
}): MovePlan {
  const nodesById = byId(graph);
  const closure = new Set(snapshot.nodes.map((node) => node.id));
  const roots = topLevelNodes(snapshot).flatMap((node) => {
    const current = nodesById.get(node.id);
    return current ? [current] : [];
  });
  const flowEligible = roots.every((node) => FLOW_ELIGIBLE.has(node.kind));
  const explicitFlow =
    target.explicitFlowId === undefined || target.explicitFlowId === null
      ? null
      : (nodesById.get(target.explicitFlowId) ?? null);
  const containment: ContainmentReason = !flowEligible
    ? "whole-flow"
    : explicitFlow
      ? "explicit-flow"
      : target.explicitFlowId === null
        ? "explicit-show-level"
        : "original-parent";
  const origin = roots.reduce(
    (min, node) => {
      const position = absolutePositionOf(graph, node);
      return { x: Math.min(min.x, position.x), y: Math.min(min.y, position.y) };
    },
    { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY },
  );
  const moves = roots.map((node) => {
    const absolute = absolutePositionOf(graph, node);
    const landed = {
      x: Math.round(target.at.x + (absolute.x - origin.x)),
      y: Math.round(target.at.y + (absolute.y - origin.y)),
    };
    let parentId: string | null = null;
    if (containment === "explicit-flow" && explicitFlow) parentId = explicitFlow.id;
    else if (containment === "original-parent") parentId = node.parentId;
    const parent = parentId ? nodesById.get(parentId) : undefined;
    const position = parent
      ? { x: landed.x - parent.position.x, y: landed.y - parent.position.y }
      : landed;
    return { nodeId: node.id, parentId, position, reparent: parentId !== node.parentId };
  });
  const parentAfter = new Map(graph.nodes.map((node) => [node.id, node.parentId]));
  for (const move of moves) parentAfter.set(move.nodeId, move.parentId);
  const blockers: RequiredRepair[] = [];
  for (const edge of graph.edges) {
    if (edge.kind !== "navigate") continue;
    if (closure.has(edge.sourceId) === closure.has(edge.targetId)) continue;
    if (parentAfter.get(edge.sourceId) === parentAfter.get(edge.targetId)) continue;
    blockers.push({
      owner: nodeName(graph, edge.sourceId),
      target: nodeName(graph, edge.targetId),
      reason: "This Navigate Action would cross Flows after the move.",
    });
  }
  return {
    kind: "move",
    nodeIds: [...closure],
    moves,
    containerName: explicitFlow?.name ?? null,
    containment,
    blockers,
  };
}

export interface RemovalConsequences {
  blockers: RequiredRepair[];
  lostWiring: DisconnectedInput[];
  retiredDevices: string[];
}

/** What removing the originals after a cross-Show move would do to the source Show. */
export function removalConsequences(
  graph: ShowGraph,
  nodeIds: readonly string[],
): RemovalConsequences {
  const closure = new Set(nodeIds);
  const blockers: RequiredRepair[] = [];
  const lostWiring: DisconnectedInput[] = [];
  for (const edge of graph.edges) {
    if (closure.has(edge.sourceId) && !closure.has(edge.targetId)) {
      if (edge.kind === "wiring" || edge.kind === "device") {
        lostWiring.push({
          consumer: nodeName(graph, edge.targetId),
          producer: nodeName(graph, edge.sourceId),
        });
      }
    }
    if (!closure.has(edge.sourceId) && closure.has(edge.targetId) && edge.kind === "navigate") {
      blockers.push({
        owner: nodeName(graph, edge.sourceId),
        target: nodeName(graph, edge.targetId),
        reason: "A surviving Scene navigates to content being moved away.",
      });
    }
  }
  const retiredDevices = graph.nodes
    .filter((node) => closure.has(node.id) && node.kind === "device" && node.pairingCode)
    .map((node) => node.name);
  return { blockers, lostWiring, retiredDevices };
}

export function removalEdits(graph: ShowGraph, nodeIds: readonly string[]) {
  const closure = new Set(nodeIds);
  const edgeEdits = graph.edges
    .filter((edge) => closure.has(edge.sourceId) || closure.has(edge.targetId))
    .map((edge) => ({ type: "graph.removeEdge" as const, edgeId: edge.id }));
  const children = graph.nodes.filter((node) => closure.has(node.id) && node.parentId);
  const parents = graph.nodes.filter((node) => closure.has(node.id) && !node.parentId);
  const nodeEdits = [...children, ...parents].map((node) => ({
    type: "graph.removeNode" as const,
    nodeId: node.id,
  }));
  return [...edgeEdits, ...nodeEdits];
}
