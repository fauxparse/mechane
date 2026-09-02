export const EVENT_KINDS = ["tap"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export type InteractionOwner =
  | { readonly kind: "scene"; readonly sceneId: string }
  | { readonly kind: "block"; readonly blockId: string };

export interface EventBinding {
  id: string;
  canvasId: string;
  elementId: string;
  eventKind: EventKind;
  cueId: string;
  /** Evaluation priority among bindings for this Element and Event kind. */
  position: number;
}

export interface Cue {
  id: string;
  name: string;
  owner: InteractionOwner;
  actionIds: readonly string[];
}

export interface NavigateAction {
  id: string;
  cueId: string;
  kind: "navigate";
  targetSceneId: string;
}

export type Action = NavigateAction;

export interface InteractionCollections {
  cues: readonly Cue[];
  actions: readonly Action[];
  eventBindings: readonly EventBinding[];
}

export function interactionCollections(
  graph: Partial<InteractionCollections>,
): InteractionCollections {
  return {
    cues: graph.cues ?? [],
    actions: graph.actions ?? [],
    eventBindings: graph.eventBindings ?? [],
  };
}

export interface RuntimeEventObservation {
  sceneId: string;
  canvasId: string;
  elementId: string;
  eventKind: string;
}

export type RuntimeEventPlan =
  | { kind: "unbound"; reason: "stale-scene" | "unbound-event" }
  | { kind: "planned"; sceneId: string; cue: Cue; actions: readonly Action[] };

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
      candidate.eventKind !== observation.eventKind ||
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

export function navigateEdgeId(actionId: string): string {
  return `navigate:${actionId}`;
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
      },
    ];
  });
}

export type InteractionViolation =
  | "duplicateInteractionId"
  | "invalidEventKind"
  | "emptyCueName"
  | "duplicateCueName"
  | "missingCue"
  | "missingAction"
  | "actionOwnership"
  | "emptyActionList"
  | "unsupportedAction"
  | "missingScene"
  | "missingBlock"
  | "navigateSceneFlow"
  | "invalidCurrentActionCount"
  | "invalidEventBindingPosition"
  | "duplicateEventBindingPosition"
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
    if (binding.eventKind !== "tap") {
      throw new InvalidInteractionError(
        "invalidEventKind",
        `Event Binding "${binding.id}" has an unsupported Event kind.`,
      );
    }
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

  return interactions;
}
