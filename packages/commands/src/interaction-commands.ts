import type {
  Action,
  Cue,
  EventBinding,
  ShowGraph,
  UpdateOperand,
  UpdateOperation,
} from "@mechane/domain";
import { isBindableKey } from "@mechane/domain";

import { capturing, composite } from "./command";
import type { ShowGraphCommand } from "./graph-commands";
import { GRAPH_COMMAND_TYPES, renameNode } from "./graph-commands";
import type { GraphEdit } from "./graph-edits";
import type { RequiredInteractionState } from "./interaction-projection";
import { interactionsOf as interactions, withInteractions } from "./interaction-projection";

function cueOrThrow(graph: ShowGraph, cueId: string): Cue {
  const cue = (graph.cues ?? []).find((candidate) => candidate.id === cueId);
  if (!cue) throw new Error(`Show graph has no Cue "${cueId}".`);
  return cue;
}

function actionOrThrow(graph: ShowGraph, actionId: string): Action {
  const action = (graph.actions ?? []).find((candidate) => candidate.id === actionId);
  if (!action) throw new Error(`Show graph has no Action "${actionId}".`);
  return action;
}
function bindingScope(binding: EventBinding): string {
  return `${binding.canvasId}:${binding.elementId}`;
}

function bindingIdsInScopeOrder(graph: ShowGraph, bindingIds: readonly string[]): string[] {
  const current = interactions(graph).eventBindings;
  const firstId = bindingIds[0];
  if (!firstId || new Set(bindingIds).size !== bindingIds.length) {
    throw new Error("Event Binding order needs unique binding IDs.");
  }
  const first = current.find((binding) => binding.id === firstId);
  if (!first) throw new Error(`Show graph has no Event Binding "${firstId}".`);
  const scope = bindingScope(first);
  const scoped = current.filter((binding) => bindingScope(binding) === scope);
  const requested = new Set(bindingIds);
  if (scoped.length !== bindingIds.length || scoped.some((binding) => !requested.has(binding.id))) {
    throw new Error("Event Binding order must include every binding for one Element.");
  }
  return scoped
    .slice()
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map((binding) => binding.id);
}

function applyBindingOrder(graph: ShowGraph, bindingIds: readonly string[]): ShowGraph {
  bindingIdsInScopeOrder(graph, bindingIds);
  const positions = new Map(bindingIds.map((bindingId, position) => [bindingId, position]));
  return withInteractions(graph, {
    ...interactions(graph),
    eventBindings: (graph.eventBindings ?? []).map((binding) => {
      const position = positions.get(binding.id);
      return position === undefined ? binding : { ...binding, position };
    }),
  });
}

function withBindingKey(graph: ShowGraph, bindingId: string, key: string | null): ShowGraph {
  return withInteractions(graph, {
    ...interactions(graph),
    eventBindings: (graph.eventBindings ?? []).map((binding) =>
      binding.id === bindingId && binding.eventKind === "keypress"
        ? { ...binding, params: { ...binding.params, key } }
        : binding,
    ),
  });
}

export function addCue(cue: Cue, label = "Create Cue"): ShowGraphCommand {
  return capturing<ShowGraph, null, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.addCue,
    label,
    scope: "selection",
    capture: () => null,
    apply: (graph) =>
      withInteractions(graph, { ...interactions(graph), cues: [...(graph.cues ?? []), cue] }),
    restore: (graph) =>
      withInteractions(graph, {
        ...interactions(graph),
        cues: (graph.cues ?? []).filter((item) => item.id !== cue.id),
      }),
    edits: [{ type: GRAPH_COMMAND_TYPES.addCue, cue }],
    restoreEdits: () => [{ type: GRAPH_COMMAND_TYPES.removeCue, cueId: cue.id }],
  });
}

export function renameCue(cueId: string, name: string, label = "Rename Cue"): ShowGraphCommand {
  return capturing<ShowGraph, string, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.renameCue,
    label,
    scope: "selection",
    capture: (graph) => cueOrThrow(graph, cueId).name,
    apply: (graph) =>
      withInteractions(graph, {
        ...interactions(graph),
        cues: (graph.cues ?? []).map((cue) => (cue.id === cueId ? { ...cue, name } : cue)),
      }),
    restore: (graph, previousName) =>
      withInteractions(graph, {
        ...interactions(graph),
        cues: (graph.cues ?? []).map((cue) =>
          cue.id === cueId ? { ...cue, name: previousName } : cue,
        ),
      }),
    edits: [{ type: GRAPH_COMMAND_TYPES.renameCue, cueId, name }],
    restoreEdits: (previousName) => [
      { type: GRAPH_COMMAND_TYPES.renameCue, cueId, name: previousName },
    ],
  });
}

/** Renames a newly-created Scene and its generated navigation Cue together. */
export function renameSceneAndCue(
  sceneId: string,
  cueId: string,
  sceneName: string,
  label = "Rename Scene and Cue",
): ShowGraphCommand {
  return composite({
    label,
    commands: [renameNode(sceneId, sceneName), renameCue(cueId, `Go to ${sceneName}`)],
  });
}

export function setCueActionOrder(
  cueId: string,
  actionIds: readonly string[],
  label = "Reorder Cue Actions",
): ShowGraphCommand {
  return capturing<ShowGraph, readonly string[], GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setCueActionOrder,
    label,
    scope: "selection",
    capture: (graph) => [...cueOrThrow(graph, cueId).actionIds],
    apply: (graph) =>
      withInteractions(graph, {
        ...interactions(graph),
        cues: (graph.cues ?? []).map((cue) =>
          cue.id === cueId ? { ...cue, actionIds: [...actionIds] } : cue,
        ),
      }),
    restore: (graph, previousOrder) =>
      withInteractions(graph, {
        ...interactions(graph),
        cues: (graph.cues ?? []).map((cue) =>
          cue.id === cueId ? { ...cue, actionIds: [...previousOrder] } : cue,
        ),
      }),
    edits: [{ type: GRAPH_COMMAND_TYPES.setCueActionOrder, cueId, actionIds: [...actionIds] }],
    restoreEdits: (previousOrder) => [
      { type: GRAPH_COMMAND_TYPES.setCueActionOrder, cueId, actionIds: [...previousOrder] },
    ],
  });
}

type RemovedCue = {
  cue: Cue;
  cueIndex: number;
  actions: { value: Action; index: number }[];
  eventBindings: { value: EventBinding; index: number }[];
};

function insertAt<T>(values: readonly T[], value: T, index: number): T[] {
  const next = [...values];
  next.splice(Math.min(Math.max(index, 0), next.length), 0, value);
  return next;
}

export function removeCue(cueId: string, label = "Delete Cue"): ShowGraphCommand {
  return capturing<ShowGraph, RemovedCue, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.removeCue,
    label,
    scope: "selection",
    capture: (graph) => {
      const current = interactions(graph);
      const cue = cueOrThrow(graph, cueId);
      return {
        cue,
        cueIndex: current.cues.findIndex((candidate) => candidate.id === cueId),
        actions: current.actions.flatMap((value, index) =>
          value.cueId === cueId ? [{ value, index }] : [],
        ),
        eventBindings: current.eventBindings.flatMap((value, index) =>
          value.cueId === cueId ? [{ value, index }] : [],
        ),
      };
    },
    apply: (graph) => {
      const current = interactions(graph);
      return withInteractions(graph, {
        cues: current.cues.filter((cue) => cue.id !== cueId),
        actions: current.actions.filter((action) => action.cueId !== cueId),
        eventBindings: current.eventBindings.filter((binding) => binding.cueId !== cueId),
      });
    },
    restore: (graph, removed) => {
      let current: RequiredInteractionState = interactions(graph);
      current = {
        cues: insertAt(current.cues, removed.cue, removed.cueIndex),
        actions: current.actions,
        eventBindings: current.eventBindings,
      };
      for (const item of removed.actions)
        current.actions = insertAt(current.actions, item.value, item.index);
      for (const item of removed.eventBindings) {
        current.eventBindings = insertAt(current.eventBindings, item.value, item.index);
      }
      return withInteractions(graph, current);
    },
    restoreEdits: (removed): GraphEdit[] => [
      { type: GRAPH_COMMAND_TYPES.addCue, cue: removed.cue },
      ...removed.actions.flatMap((item): GraphEdit[] =>
        item.value.kind === "navigate"
          ? [{ type: GRAPH_COMMAND_TYPES.addNavigateAction, action: item.value }]
          : [{ type: GRAPH_COMMAND_TYPES.addUpdateAction, action: item.value }],
      ),
      ...removed.eventBindings.map((item) => ({
        type: GRAPH_COMMAND_TYPES.addEventBinding,
        binding: item.value,
      })),
    ],
  });
}

export function addNavigateAction(
  action: Extract<Action, { kind: "navigate" }>,
  label = "Add Navigate Action",
): ShowGraphCommand {
  return capturing<ShowGraph, null, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.addNavigateAction,
    label,
    scope: "selection",
    capture: () => null,
    apply: (graph) => {
      cueOrThrow(graph, action.cueId);
      return withInteractions(graph, {
        ...interactions(graph),
        actions: [...(graph.actions ?? []), action],
      });
    },
    restore: (graph) => {
      const current = interactions(graph);
      return withInteractions(graph, {
        ...current,
        cues: current.cues.map((cue) =>
          cue.id === action.cueId
            ? { ...cue, actionIds: cue.actionIds.filter((id) => id !== action.id) }
            : cue,
        ),
        actions: current.actions.filter((item) => item.id !== action.id),
      });
    },
    edits: [{ type: GRAPH_COMMAND_TYPES.addNavigateAction, action }],
    restoreEdits: () => [{ type: GRAPH_COMMAND_TYPES.removeAction, actionId: action.id }],
  });
}

export function addUpdateAction(
  action: Extract<Action, { kind: "update" }>,
  label = "Add Update Action",
): ShowGraphCommand {
  return capturing<ShowGraph, null, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.addUpdateAction,
    label,
    scope: "selection",
    capture: () => null,
    apply: (graph) =>
      withInteractions(graph, {
        ...interactions(graph),
        actions: [...interactions(graph).actions, action],
      }),
    restore: (graph) => graph,
    edits: [{ type: GRAPH_COMMAND_TYPES.addUpdateAction, action }],
    restoreEdits: () => [{ type: GRAPH_COMMAND_TYPES.removeAction, actionId: action.id }],
  });
}

export function setUpdateTarget(
  actionId: string,
  target: Extract<Action, { kind: "update" }>["target"],
): ShowGraphCommand {
  return capturing<ShowGraph, Extract<Action, { kind: "update" }>["target"], GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setUpdateTarget,
    label: "Change Update Target",
    scope: "selection",
    capture: (graph) => {
      const action = actionOrThrow(graph, actionId);
      if (action.kind !== "update") throw new Error(`Action "${actionId}" is not an Update.`);
      return action.target;
    },
    apply: (graph) =>
      withInteractions(graph, {
        ...interactions(graph),
        actions: interactions(graph).actions.map((action) =>
          action.id === actionId && action.kind === "update" ? { ...action, target } : action,
        ),
      }),
    restore: (graph, previous) =>
      withInteractions(graph, {
        ...interactions(graph),
        actions: interactions(graph).actions.map((action) =>
          action.id === actionId && action.kind === "update"
            ? { ...action, target: previous }
            : action,
        ),
      }),
    edits: [{ type: GRAPH_COMMAND_TYPES.setUpdateTarget, actionId, target }],
    restoreEdits: (previous) => [
      { type: GRAPH_COMMAND_TYPES.setUpdateTarget, actionId, target: previous },
    ],
  });
}

export function setUpdateOperation(actionId: string, operation: UpdateOperation): ShowGraphCommand {
  return capturing<ShowGraph, UpdateOperation, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setUpdateOperation,
    label: "Change Update Operation",
    scope: "selection",
    capture: (graph) => {
      const action = actionOrThrow(graph, actionId);
      if (action.kind !== "update") throw new Error(`Action "${actionId}" is not an Update.`);
      return action.operation;
    },
    apply: (graph) =>
      withInteractions(graph, {
        ...interactions(graph),
        actions: interactions(graph).actions.map((action) =>
          action.id === actionId && action.kind === "update" ? { ...action, operation } : action,
        ),
      }),
    restore: (graph, previous) =>
      withInteractions(graph, {
        ...interactions(graph),
        actions: interactions(graph).actions.map((action) =>
          action.id === actionId && action.kind === "update"
            ? { ...action, operation: previous }
            : action,
        ),
      }),
    edits: [{ type: GRAPH_COMMAND_TYPES.setUpdateOperation, actionId, operation }],
    restoreEdits: (previous) => [
      { type: GRAPH_COMMAND_TYPES.setUpdateOperation, actionId, operation: previous },
    ],
  });
}
export function setUpdateOperand(actionId: string, operand: UpdateOperand): ShowGraphCommand {
  return capturing<ShowGraph, UpdateOperation, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setUpdateOperand,
    label: "Change Update Operand",
    scope: "selection",
    capture: (graph) => {
      const action = actionOrThrow(graph, actionId);
      if (action.kind !== "update" || action.operation.kind === "reset") {
        throw new Error(`Action "${actionId}" has no Update operand.`);
      }
      return action.operation;
    },
    apply: (graph) =>
      withInteractions(graph, {
        ...interactions(graph),
        actions: interactions(graph).actions.map((action) => {
          if (
            action.id !== actionId ||
            action.kind !== "update" ||
            action.operation.kind === "reset"
          ) {
            return action;
          }
          return {
            ...action,
            operation: { ...action.operation, operand },
          };
        }),
      }),
    restore: (graph, previous) =>
      withInteractions(graph, {
        ...interactions(graph),
        actions: interactions(graph).actions.map((action) =>
          action.id === actionId && action.kind === "update"
            ? { ...action, operation: previous }
            : action,
        ),
      }),
    edits: [{ type: GRAPH_COMMAND_TYPES.setUpdateOperand, actionId, operand }],
    restoreEdits: (previous) => [
      { type: GRAPH_COMMAND_TYPES.setUpdateOperation, actionId, operation: previous },
    ],
  });
}

export function setNavigateTarget(
  actionId: string,
  targetSceneId: string,
  label = "Change Navigate Target",
): ShowGraphCommand {
  return capturing<ShowGraph, string, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setNavigateTarget,
    label,
    scope: "selection",
    capture: (graph) => {
      const action = actionOrThrow(graph, actionId);
      if (action.kind !== "navigate") throw new Error(`Action "${actionId}" is not navigable.`);
      return action.targetSceneId;
    },
    apply: (graph) =>
      withInteractions(graph, {
        ...interactions(graph),
        actions: (graph.actions ?? []).map((action) =>
          action.id === actionId && action.kind === "navigate"
            ? { ...action, targetSceneId }
            : action,
        ),
      }),
    restore: (graph, previousTarget) =>
      withInteractions(graph, {
        ...interactions(graph),
        actions: (graph.actions ?? []).map((action) =>
          action.id === actionId && action.kind === "navigate"
            ? { ...action, targetSceneId: previousTarget }
            : action,
        ),
      }),
    edits: [{ type: GRAPH_COMMAND_TYPES.setNavigateTarget, actionId, targetSceneId }],
    restoreEdits: (previousTarget) => [
      { type: GRAPH_COMMAND_TYPES.setNavigateTarget, actionId, targetSceneId: previousTarget },
    ],
  });
}

export function removeAction(actionId: string, label = "Delete Action"): ShowGraphCommand {
  return capturing<ShowGraph, { action: Action; cue: Cue; position: number }, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.removeAction,
    label,
    scope: "selection",
    capture: (graph) => {
      const action = actionOrThrow(graph, actionId);
      const cue = cueOrThrow(graph, action.cueId);
      const position = cue.actionIds.indexOf(actionId);
      if (position < 0) throw new Error(`Cue "${cue.id}" does not own Action "${actionId}".`);
      return { action, cue, position };
    },
    apply: (graph) => {
      const current = interactions(graph);
      return withInteractions(graph, {
        ...current,
        cues: current.cues.map((cue) =>
          cue.id === current.actions.find((action) => action.id === actionId)?.cueId
            ? { ...cue, actionIds: cue.actionIds.filter((id) => id !== actionId) }
            : cue,
        ),
        actions: current.actions.filter((action) => action.id !== actionId),
      });
    },
    restore: (graph, removed) => {
      const current = interactions(graph);
      return withInteractions(graph, {
        ...current,
        cues: current.cues.map((cue) =>
          cue.id === removed.cue.id
            ? { ...cue, actionIds: insertAt(cue.actionIds, removed.action.id, removed.position) }
            : cue,
        ),
        actions: [...current.actions, removed.action],
      });
    },
    edits: [{ type: GRAPH_COMMAND_TYPES.removeAction, actionId }],
    restoreEdits: (removed): GraphEdit[] => [
      removed.action.kind === "navigate"
        ? { type: GRAPH_COMMAND_TYPES.addNavigateAction, action: removed.action }
        : { type: GRAPH_COMMAND_TYPES.addUpdateAction, action: removed.action },
      {
        type: GRAPH_COMMAND_TYPES.setCueActionOrder,
        cueId: removed.cue.id,
        actionIds: [...removed.cue.actionIds],
      },
    ],
  });
}

export function addEventBinding(binding: EventBinding, label = "Bind Event"): ShowGraphCommand {
  return capturing<ShowGraph, null, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.addEventBinding,
    label,
    scope: "selection",
    capture: () => null,
    apply: (graph) =>
      withInteractions(graph, {
        ...interactions(graph),
        eventBindings: [...(graph.eventBindings ?? []), binding],
      }),
    restore: (graph) =>
      withInteractions(graph, {
        ...interactions(graph),
        eventBindings: (graph.eventBindings ?? []).filter((item) => item.id !== binding.id),
      }),
    edits: [{ type: GRAPH_COMMAND_TYPES.addEventBinding, binding }],
    restoreEdits: () => [{ type: GRAPH_COMMAND_TYPES.removeEventBinding, bindingId: binding.id }],
  });
}

export function setEventBindingCue(
  bindingId: string,
  cueId: string,
  label = "Change Event Cue",
): ShowGraphCommand {
  return capturing<ShowGraph, string, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setEventBindingCue,
    label,
    scope: "selection",
    capture: (graph) => {
      const binding = (graph.eventBindings ?? []).find((candidate) => candidate.id === bindingId);
      if (!binding) throw new Error(`Show graph has no Event Binding "${bindingId}".`);
      cueOrThrow(graph, cueId);
      return binding.cueId;
    },
    apply: (graph) =>
      withInteractions(graph, {
        ...interactions(graph),
        eventBindings: (graph.eventBindings ?? []).map((binding) =>
          binding.id === bindingId ? { ...binding, cueId } : binding,
        ),
      }),
    restore: (graph, previousCueId) =>
      withInteractions(graph, {
        ...interactions(graph),
        eventBindings: (graph.eventBindings ?? []).map((binding) =>
          binding.id === bindingId ? { ...binding, cueId: previousCueId } : binding,
        ),
      }),
    edits: [{ type: GRAPH_COMMAND_TYPES.setEventBindingCue, bindingId, cueId }],
    restoreEdits: (previousCueId) => [
      { type: GRAPH_COMMAND_TYPES.setEventBindingCue, bindingId, cueId: previousCueId },
    ],
  });
}
/**
 * Assigns the key a `keypress` Binding waits for.
 *
 * Separate from `addEventBinding` because a Binding is created before its key
 * is captured: the author picks Keypress from a menu, the row appears, and the
 * capture control takes the next keystroke. An unset key is valid and inert
 * (#517), so the intermediate state needs no special handling.
 */
export function setEventBindingKey(
  bindingId: string,
  key: string | null,
  label = "Set Event Key",
): ShowGraphCommand {
  return capturing<ShowGraph, string | null, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setEventBindingKey,
    label,
    scope: "selection",
    capture: (graph) => {
      const binding = (graph.eventBindings ?? []).find((candidate) => candidate.id === bindingId);
      if (!binding) throw new Error(`Show graph has no Event Binding "${bindingId}".`);
      if (binding.eventKind !== "keypress") {
        throw new Error(`Event Binding "${bindingId}" is not a keypress.`);
      }
      if (key !== null && !isBindableKey(key)) {
        throw new Error(`"${key}" is not a bindable key.`);
      }
      return binding.params.key;
    },
    apply: (graph) => withBindingKey(graph, bindingId, key),
    restore: (graph, previousKey) => withBindingKey(graph, bindingId, previousKey),
    edits: [{ type: GRAPH_COMMAND_TYPES.setEventBindingKey, bindingId, key }],
    restoreEdits: (previousKey) => [
      { type: GRAPH_COMMAND_TYPES.setEventBindingKey, bindingId, key: previousKey },
    ],
  });
}

export function setEventBindingOrder(
  bindingIds: readonly string[],
  label = "Reorder Event Bindings",
): ShowGraphCommand {
  return capturing<ShowGraph, readonly string[], GraphEdit>({
    type: GRAPH_COMMAND_TYPES.setEventBindingOrder,
    label,
    scope: "selection",
    capture: (graph) => bindingIdsInScopeOrder(graph, bindingIds),
    apply: (graph) => applyBindingOrder(graph, bindingIds),
    restore: (graph, previousOrder) => applyBindingOrder(graph, previousOrder),
    edits: [{ type: GRAPH_COMMAND_TYPES.setEventBindingOrder, bindingIds: [...bindingIds] }],
    restoreEdits: (previousOrder) => [
      { type: GRAPH_COMMAND_TYPES.setEventBindingOrder, bindingIds: [...previousOrder] },
    ],
  });
}

export function removeEventBinding(
  bindingId: string,
  label = "Remove Event Binding",
): ShowGraphCommand {
  return capturing<ShowGraph, EventBinding, GraphEdit>({
    type: GRAPH_COMMAND_TYPES.removeEventBinding,
    label,
    scope: "selection",
    capture: (graph) => {
      const binding = (graph.eventBindings ?? []).find((candidate) => candidate.id === bindingId);
      if (!binding) throw new Error(`Show graph has no Event Binding "${bindingId}".`);
      return binding;
    },
    apply: (graph) =>
      withInteractions(graph, {
        ...interactions(graph),
        eventBindings: (graph.eventBindings ?? []).filter((binding) => binding.id !== bindingId),
      }),
    restore: (graph, binding) =>
      withInteractions(graph, {
        ...interactions(graph),
        eventBindings: [...(graph.eventBindings ?? []), binding],
      }),
    edits: [{ type: GRAPH_COMMAND_TYPES.removeEventBinding, bindingId }],
    restoreEdits: (binding) => [{ type: GRAPH_COMMAND_TYPES.addEventBinding, binding }],
  });
}

export function createBindingWithCue(
  binding: EventBinding,
  cue: Cue,
  action: Extract<Action, { kind: "navigate" }>,
): ShowGraphCommand {
  return composite({
    type: "graph.createInteraction",
    label: "Create Interaction",
    scope: "selection",
    commands: [addCue(cue), addNavigateAction(action), addEventBinding(binding)],
  });
}
