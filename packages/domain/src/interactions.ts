import { isBindableKey } from "./keys";
import type { EdgeLayout } from "./edge-layout";
import type { Type } from "./shapes";

export const EVENT_KINDS = ["tap", "keypress"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export type InteractionOwner =
  | { readonly kind: "scene"; readonly sceneId: string }
  | { readonly kind: "block"; readonly blockId: string };

/** Fields every Event Binding carries, whatever its kind. */
export interface EventBindingBase {
  id: string;
  canvasId: string;
  elementId: string;
  cueId: string;
  /** Evaluation priority among bindings for this Element and Event kind. */
  position: number;
}

/**
 * The key a `keypress` Binding waits for, in the stored form `./keys` defines.
 * `null` while the author has added the Binding but not yet captured a key —
 * valid and silent, like a Cue with no Actions, and never matched at dispatch.
 */
export interface KeypressParams {
  key: string | null;
}

/**
 * An authored Event Binding.
 *
 * A union rather than a `params` field on every kind, so that `tap` — which
 * genuinely has no parameters — carries no `params` key at all, and a third
 * unparameterised kind costs nothing.
 *
 * A `keypress` Binding is only *meaningful* on the root Element of a
 * Scene-owned Canvas, because that is what Canvas-level scope means here. It
 * is not enforced: `ShowGraph` carries no Canvas data, so this module cannot
 * see whether an `elementId` is a root. A keypress bound elsewhere is inert —
 * the authoring UI never offers it and the Player only ever observes keypress
 * against the root, so it can never fire.
 */
export type EventBinding =
  | (EventBindingBase & { eventKind: "tap" })
  | (EventBindingBase & { eventKind: "keypress"; params: KeypressParams });

export interface CueParameter {
  id: string;
  name: string;
  type: Type;
  position: number;
}

export interface Cue {
  id: string;
  name: string;
  owner: InteractionOwner;
  /** Block Cues remain actionless; Scene Cues own their ordered Actions. */
  actionIds: readonly string[];
  parameters?: readonly CueParameter[];
}

export interface ParameterMapping {
  sourceParameterId: string;
  targetParameterId: string;
  sourceFieldPath?: readonly string[];
}

export interface SlotEventBinding {
  id: string;
  slotElementId: string;
  sourceCueId: string;
  targetCueId: string;
  parameterMappings: readonly ParameterMapping[];
  position: number;
}

export interface BlockInstancePathSegment {
  slotElementId: string;
  index: number;
}

export interface NavigateAction {
  id: string;
  cueId: string;
  kind: "navigate";
  targetSceneId: string;
  /**
   * Where the author has dragged the edge this Action projects, if anywhere.
   *
   * It lives on the Action rather than on the edge because the edge does not
   * outlive a write: navigate edges are the materialized projection of the
   * Actions (`projectNavigateEdges`), rebuilt from them every time a graph is
   * stored, so anything hung on the edge alone is thrown away. The Action is
   * the durable half of the same fact, and a deleted Action takes its edge's
   * layout with it, which is what should happen.
   */
  layout?: EdgeLayout;
}

/**
 * Every Action type that projects an edge must keep that edge's authored
 * layout on the Action, then have its projection copy the layout onto the
 * materialized edge. Do not add layout only to a projected edge: graph writes
 * rebuild projected edges from Actions, and the edge-only value will vanish.
 * Also update the Action codec, its persistence row, and the GraphQL serializer
 * when adding the next Action type. See `NavigateAction.layout` for the
 * complete pattern.
 */
export type Action = NavigateAction;

export interface InteractionCollections {
  cues: readonly Cue[];
  actions: readonly Action[];
  eventBindings: readonly EventBinding[];
  slotEventBindings: readonly SlotEventBinding[];
}

export function interactionCollections(
  graph: Partial<InteractionCollections>,
): InteractionCollections {
  return {
    cues: graph.cues ?? [],
    actions: graph.actions ?? [],
    eventBindings: graph.eventBindings ?? [],
    slotEventBindings: graph.slotEventBindings ?? [],
  };
}

interface RuntimeEventObservationBase {
  sceneId: string;
  canvasId: string;
  elementId: string;
}

/**
 * One Event as the Player saw it. Mirrors `EventBinding` so that resolution
 * compares two values of the same shape, and so a new kind cannot be added
 * without the compiler naming every site that must handle it.
 */
export type RuntimeEventObservation =
  | (RuntimeEventObservationBase & { eventKind: "tap" })
  | (RuntimeEventObservationBase & { eventKind: "keypress"; params: { key: string } });

export type RuntimeEventPlan =
  | { kind: "unbound"; reason: "stale-scene" | "unbound-event" }
  | { kind: "planned"; sceneId: string; cue: Cue; actions: readonly Action[] };

/**
 * Whether a Binding answers an observation: same kind, and — for kinds that
 * carry parameters — the same payload. `position` stays a tiebreak *among
 * equal matches*, so two keypress Bindings for different keys never compete.
 *
 * An unset key matches nothing, which is what makes a half-authored Binding
 * inert rather than a Binding that fires on every key.
 */
function matchesObservation(binding: EventBinding, observation: RuntimeEventObservation): boolean {
  if (binding.eventKind !== observation.eventKind) return false;
  if (binding.eventKind === "tap") return true;
  const observed = observation as Extract<RuntimeEventObservation, { eventKind: "keypress" }>;
  return binding.params.key !== null && binding.params.key === observed.params.key;
}

/**
 * Resolves an observed runtime Event into the complete authored Action plan.
 * Expected stale or unbound observations are returned as data; an invalid
 * trusted interaction aggregate still throws through assertValidInteractions.
 */
export function resolveRuntimeEvent(
  graph: {
    nodes: readonly { id: string; kind: string; parentId: string | null }[];
    cues?: readonly Cue[];
    actions?: readonly Action[];
    eventBindings?: readonly EventBinding[];
  },
  observation: RuntimeEventObservation,
): RuntimeEventPlan {
  const interactions = assertValidInteractions(graph);
  const scene = graph.nodes.find(
    (node) => node.id === observation.sceneId && node.kind === "scene",
  );
  if (!scene || scene.parentId === null) {
    return { kind: "unbound", reason: "stale-scene" };
  }
  let binding: EventBinding | undefined;
  for (const candidate of interactions.eventBindings) {
    if (
      candidate.canvasId !== observation.canvasId ||
      candidate.elementId !== observation.elementId ||
      !matchesObservation(candidate, observation) ||
      (binding &&
        (candidate.position > binding.position ||
          (candidate.position === binding.position && candidate.id >= binding.id)))
    ) {
      continue;
    }
    binding = candidate;
  }
  if (!binding) return { kind: "unbound", reason: "unbound-event" };
  const cue = interactions.cues.find((candidate) => candidate.id === binding.cueId);
  if (!cue || cue.owner.kind !== "scene" || cue.owner.sceneId !== scene.id) {
    throw new InvalidInteractionError(
      "bindingScene",
      `Event Binding "${binding.id}" does not belong to Scene "${scene.id}".`,
    );
  }
  const actions = cue.actionIds.map((actionId) => {
    const action = interactions.actions.find((candidate) => candidate.id === actionId);
    if (!action) {
      throw new InvalidInteractionError(
        "missingAction",
        `Cue "${cue.id}" references missing Action "${actionId}".`,
      );
    }
    return action;
  });
  return { kind: "planned", sceneId: scene.id, cue, actions };
}

/** The id of the edge an Action projects as. */
export function navigateEdgeId(actionId: string): string {
  return `navigate:${actionId}`;
}

/**
 * The Action an edge id names, or null when the id names a stored edge.
 *
 * An edit addressed to a projected edge has to reach the Action instead: the
 * edge itself is rebuilt from the Actions on every write, so anything written
 * to it alone lasts until the next one.
 */
export function navigateEdgeActionId(edgeId: string): string | null {
  const actionId = edgeId.startsWith("navigate:") ? edgeId.slice("navigate:".length) : "";
  return actionId.length > 0 ? actionId : null;
}

export function projectNavigateEdges(graph: {
  nodes: readonly { id: string; kind: string; parentId: string | null }[];
  cues?: readonly Cue[];
  actions?: readonly Action[];
}): readonly {
  id: string;
  kind: "navigate";
  sourceId: string;
  targetId: string;
  sourcePath: string[];
  targetPath: string[];
  cueId: string;
  actionId: string;
  layout?: EdgeLayout;
}[] {
  const { cues, actions } = interactionCollections(graph);
  const scenes = new Map(
    graph.nodes.filter((node) => node.kind === "scene").map((node) => [node.id, node]),
  );
  const cuesById = new Map(cues.map((cue) => [cue.id, cue]));
  return actions.flatMap((action) => {
    const cue = cuesById.get(action.cueId);
    const source = cue?.owner.kind === "scene" ? scenes.get(cue.owner.sceneId) : undefined;
    const target = scenes.get(action.targetSceneId);
    if (!cue || !source || !target) return [];
    return [
      {
        id: navigateEdgeId(action.id),
        kind: "navigate" as const,
        sourceId: source.id,
        targetId: target.id,
        sourcePath: [],
        targetPath: [],
        cueId: cue.id,
        actionId: action.id,
        // The Action is where a drag on this edge is kept; see its `layout`.
        ...(action.layout ? { layout: action.layout } : {}),
      },
    ];
  });
}

export type InteractionViolation =
  | "duplicateInteractionId"
  | "invalidEventKind"
  | "invalidEventParams"
  | "emptyCueName"
  | "duplicateCueName"
  | "missingCue"
  | "missingAction"
  | "actionOwnership"
  | "unsupportedAction"
  | "missingScene"
  | "missingBlock"
  | "navigateSceneFlow"
  | "invalidEventBindingPosition"
  | "duplicateEventBindingPosition"
  | "invalidSlotEventBindingPosition"
  | "duplicateSlotEventBindingPosition"
  | "invalidBlockCue"
  | "emptyElementReference"
  | "bindingScene";

export class InvalidInteractionError extends Error {
  constructor(
    readonly reason: InteractionViolation,
    detail: string,
  ) {
    super(`Invalid interaction configuration: ${detail}`);
    this.name = "InvalidInteractionError";
  }
}

function requireScene(
  scenes: ReadonlyMap<string, { id: string; kind: string; parentId: string | null }>,
  sceneId: string,
  role: string,
): { id: string; kind: string; parentId: string | null } {
  const scene = scenes.get(sceneId);
  if (!scene || scene.kind !== "scene") {
    throw new InvalidInteractionError("missingScene", `${role} references Scene "${sceneId}".`);
  }
  return scene;
}

/**
 * The per-kind payload rule. Shape only — whether a key is *bindable* is
 * `./keys`, which both this and the Studio capture control consult so the two
 * cannot drift.
 */
function assertValidEventParams(binding: EventBinding): void {
  if (binding.eventKind === "tap") {
    if ("params" in binding) {
      throw new InvalidInteractionError(
        "invalidEventParams",
        `Event Binding "${binding.id}" is a tap and must carry no params.`,
      );
    }
    return;
  }
  const params: unknown = binding.params;
  if (typeof params !== "object" || params === null) {
    throw new InvalidInteractionError(
      "invalidEventParams",
      `Event Binding "${binding.id}" is a keypress and must carry params.`,
    );
  }
  const { key } = params as { key?: unknown };
  if (key === null) return;
  if (typeof key !== "string" || !isBindableKey(key)) {
    throw new InvalidInteractionError(
      "invalidEventParams",
      `Event Binding "${binding.id}" has an unbindable key.`,
    );
  }
}

/**
 * Proves an Event Binding arriving from outside this process — the edit codec,
 * the database, the Studio's GraphQL client — and returns it typed.
 *
 * One decoder rather than one per boundary: each of those layers used to carry
 * its own two-line `kind !== "tap"` check, which was fine while there was one
 * kind and no payload. Four copies of a per-kind payload parser is how the
 * boundaries end up disagreeing about what a valid Binding is.
 *
 * Throws `InvalidInteractionError`; callers rewrap it in whatever error their
 * layer already speaks, the way `assertValidShowGraph` rewraps InvalidShapeError.
 */
export function decodeEventBinding(input: {
  id: unknown;
  canvasId: unknown;
  elementId: unknown;
  eventKind: unknown;
  cueId: unknown;
  position: unknown;
  params?: unknown;
}): EventBinding {
  const { id, canvasId, elementId, eventKind, cueId, position } = input;
  if (
    typeof id !== "string" ||
    typeof canvasId !== "string" ||
    typeof elementId !== "string" ||
    typeof cueId !== "string" ||
    !Number.isInteger(position) ||
    (position as number) < 0
  ) {
    throw new InvalidInteractionError(
      "emptyElementReference",
      `Event Binding "${String(id)}" is missing required fields.`,
    );
  }
  const base: EventBindingBase = {
    id,
    canvasId,
    elementId,
    cueId,
    position: position as number,
  };
  if (eventKind === "tap") {
    const binding: EventBinding = { ...base, eventKind: "tap" };
    assertValidEventParams(binding);
    return binding;
  }
  if (eventKind === "keypress") {
    const params = (input.params ?? {}) as { key?: unknown };
    const key = params.key === undefined ? null : params.key;
    const binding = { ...base, eventKind: "keypress" as const, params: { key } } as EventBinding;
    assertValidEventParams(binding);
    return binding;
  }
  throw new InvalidInteractionError(
    "invalidEventKind",
    `Event Binding "${String(id)}" has an unsupported Event kind.`,
  );
}

function duplicate<T>(values: readonly T[]): T | undefined {
  const seen = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

export function assertValidInteractions(graph: {
  nodes: readonly { id: string; kind: string; parentId: string | null }[];
  blocks?: readonly { id: string }[];
  cues?: readonly Cue[];
  actions?: readonly Action[];
  eventBindings?: readonly EventBinding[];
  slotEventBindings?: readonly SlotEventBinding[];
}): InteractionCollections {
  const interactions = interactionCollections(graph);
  const scenes = new Map(
    graph.nodes.filter((node) => node.kind === "scene").map((node) => [node.id, node]),
  );
  const blockIds = new Set((graph.blocks ?? []).map((block) => block.id));
  const ids = [
    ...interactions.cues.map((cue) => cue.id),
    ...interactions.actions.map((action) => action.id),
    ...interactions.eventBindings.map((binding) => binding.id),
  ];
  const duplicateId = duplicate(ids);
  if (duplicateId !== undefined) {
    throw new InvalidInteractionError(
      "duplicateInteractionId",
      `duplicate interaction ID "${duplicateId}".`,
    );
  }

  const cuesById = new Map(interactions.cues.map((cue) => [cue.id, cue]));
  const actionsById = new Map(interactions.actions.map((action) => [action.id, action]));
  const cueNames = new Map<string, Set<string>>();
  for (const cue of interactions.cues) {
    if (cue.name.trim().length === 0) {
      throw new InvalidInteractionError("emptyCueName", `Cue "${cue.id}" has an empty name.`);
    }
    const ownerKey =
      cue.owner.kind === "scene" ? `scene:${cue.owner.sceneId}` : `block:${cue.owner.blockId}`;
    if (cue.owner.kind === "scene") requireScene(scenes, cue.owner.sceneId, `Cue "${cue.id}"`);
    else if (!blockIds.has(cue.owner.blockId) && graph.blocks) {
      throw new InvalidInteractionError(
        "missingBlock",
        `Cue "${cue.id}" references Block "${cue.owner.blockId}".`,
      );
    }
    const names = cueNames.get(ownerKey) ?? new Set<string>();
    if (names.has(cue.name)) {
      throw new InvalidInteractionError(
        "duplicateCueName",
        `Owner "${ownerKey}" has duplicate Cue name "${cue.name}".`,
      );
    }
    names.add(cue.name);
    cueNames.set(ownerKey, names);
    for (const actionId of cue.actionIds) {
      const action = actionsById.get(actionId);
      if (!action) {
        throw new InvalidInteractionError(
          "missingAction",
          `Cue "${cue.id}" references missing Action "${actionId}".`,
        );
      }
      if (action.cueId !== cue.id) {
        throw new InvalidInteractionError(
          "actionOwnership",
          `Action "${action.id}" does not belong to Cue "${cue.id}".`,
        );
      }
    }
  }

  for (const action of interactions.actions) {
    if (action.kind !== "navigate") {
      throw new InvalidInteractionError(
        "unsupportedAction",
        `Action "${action.id}" has unsupported kind.`,
      );
    }
    const cue = cuesById.get(action.cueId);
    if (!cue) {
      throw new InvalidInteractionError(
        "missingCue",
        `Action "${action.id}" references missing Cue "${action.cueId}".`,
      );
    }
    if (!cue.actionIds.includes(action.id)) {
      throw new InvalidInteractionError(
        "actionOwnership",
        `Action "${action.id}" is not included in Cue "${cue.id}"'s ordered Actions.`,
      );
    }
    if (cue.owner.kind === "scene") {
      const source = requireScene(scenes, cue.owner.sceneId, `Action "${action.id}"`);
      const target = requireScene(scenes, action.targetSceneId, `Action "${action.id}"`);
      if (source.parentId === null || source.parentId !== target.parentId) {
        throw new InvalidInteractionError(
          "navigateSceneFlow",
          `Navigate Action "${action.id}" must target a Scene in the same Flow as its Cue.`,
        );
      }
    } else {
      requireScene(scenes, action.targetSceneId, `Action "${action.id}"`);
    }
  }

  const bindingPositions = new Map<string, Set<number>>();
  for (const binding of interactions.eventBindings) {
    if (!EVENT_KINDS.includes(binding.eventKind)) {
      throw new InvalidInteractionError(
        "invalidEventKind",
        `Event Binding "${binding.id}" has an unsupported Event kind.`,
      );
    }
    assertValidEventParams(binding);
    if (binding.elementId.trim().length === 0 || binding.canvasId.trim().length === 0) {
      throw new InvalidInteractionError(
        "emptyElementReference",
        `Event Binding "${binding.id}" has an empty Element reference.`,
      );
    }
    if (!Number.isInteger(binding.position) || binding.position < 0) {
      throw new InvalidInteractionError(
        "invalidEventBindingPosition",
        `Event Binding "${binding.id}" has an invalid position.`,
      );
    }
    const key = `${binding.canvasId}:${binding.elementId}`;
    const positions = bindingPositions.get(key) ?? new Set<number>();
    if (positions.has(binding.position)) {
      throw new InvalidInteractionError(
        "duplicateEventBindingPosition",
        `duplicate Event Binding position ${binding.position} for "${key}".`,
      );
    }
    positions.add(binding.position);
    bindingPositions.set(key, positions);
    if (!cuesById.has(binding.cueId)) {
      throw new InvalidInteractionError(
        "missingCue",
        `Event Binding "${binding.id}" references missing Cue "${binding.cueId}".`,
      );
    }
  }

  const slotBindingPositions = new Map<string, Set<number>>();
  for (const binding of interactions.slotEventBindings) {
    const source = cuesById.get(binding.sourceCueId);
    const target = cuesById.get(binding.targetCueId);
    if (!source || !target) {
      throw new InvalidInteractionError(
        "missingCue",
        `Slot Event Binding "${binding.id}" references a missing Cue.`,
      );
    }
    if (source.owner.kind !== "block" || source.actionIds.length > 0) {
      throw new InvalidInteractionError(
        "invalidBlockCue",
        `Slot Event Binding "${binding.id}" must emit from an actionless Block Cue.`,
      );
    }
    if (!Number.isInteger(binding.position) || binding.position < 0) {
      throw new InvalidInteractionError(
        "invalidSlotEventBindingPosition",
        `Slot Event Binding "${binding.id}" has an invalid position.`,
      );
    }
    const positions = slotBindingPositions.get(binding.slotElementId) ?? new Set<number>();
    if (positions.has(binding.position)) {
      throw new InvalidInteractionError(
        "duplicateSlotEventBindingPosition",
        `duplicate Slot Event Binding position ${binding.position}.`,
      );
    }
    positions.add(binding.position);
    slotBindingPositions.set(binding.slotElementId, positions);
  }

  return interactions;
}
