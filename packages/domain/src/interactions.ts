export const EVENT_KINDS = ["tap"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export type NonEmpty<T> = readonly [T, ...T[]];

export interface EventBinding {
  id: string;
  canvasId: string;
  elementId: string;
  eventKind: EventKind;
  cueId: string;
}

export interface Cue {
  id: string;
  name: string;
  sceneId: string;
  actionIds: NonEmpty<string>;
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
    const source = cue ? scenes.get(cue.sceneId) : undefined;
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
  | "navigateSceneFlow"
  | "invalidCurrentActionCount"
  | "duplicateEventBinding"
  | "emptyElementReference";

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
  cues?: readonly Cue[];
  actions?: readonly Action[];
  eventBindings?: readonly EventBinding[];
}): InteractionCollections {
  const interactions = interactionCollections(graph);
  const scenes = new Map(
    graph.nodes.filter((node) => node.kind === "scene").map((node) => [node.id, node]),
  );
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
    const scene = requireScene(scenes, cue.sceneId, `Cue "${cue.id}"`);
    const names = cueNames.get(scene.id) ?? new Set<string>();
    if (names.has(cue.name)) {
      throw new InvalidInteractionError(
        "duplicateCueName",
        `Scene "${scene.id}" has duplicate Cue name "${cue.name}".`,
      );
    }
    names.add(cue.name);
    cueNames.set(scene.id, names);
    if (cue.actionIds.length === 0) {
      throw new InvalidInteractionError("emptyActionList", `Cue "${cue.id}" has no Actions.`);
    }
    if (cue.actionIds.length !== 1) {
      throw new InvalidInteractionError(
        "invalidCurrentActionCount",
        `Cue "${cue.id}" must contain exactly one Navigate Action in the current runtime slice.`,
      );
    }
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
    const source = requireScene(scenes, cue.sceneId, `Action "${action.id}"`);
    const target = requireScene(scenes, action.targetSceneId, `Action "${action.id}"`);
    if (source.parentId === null || source.parentId !== target.parentId) {
      throw new InvalidInteractionError(
        "navigateSceneFlow",
        `Navigate Action "${action.id}" must target a Scene in the same Flow as its Cue.`,
      );
    }
  }

  const bindingKeys = new Set<string>();
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
    const key = `${binding.canvasId}:${binding.elementId}:${binding.eventKind}`;
    if (bindingKeys.has(key)) {
      throw new InvalidInteractionError(
        "duplicateEventBinding",
        `duplicate Event Binding for "${key}".`,
      );
    }
    bindingKeys.add(key);
    if (!cuesById.has(binding.cueId)) {
      throw new InvalidInteractionError(
        "missingCue",
        `Event Binding "${binding.id}" references missing Cue "${binding.cueId}".`,
      );
    }
  }

  return interactions;
}
