import { describe, expect, it, vi } from "vitest";
import type { ShowGraph } from "@mechane/domain/graph";
import type { RunState } from "@mechane/domain/structured-values";

import type { PlayerEventInput, PlayerEventResult } from "./api";
import {
  dispatchSharedPlayerEvent,
  showWriteOutcome,
  submitPlayerEventWithRetry,
} from "./player-event-dispatch";
import {
  displayedShowState,
  resolvePendingShowEvent,
  type PendingShowEvent,
  type ShowWriteOutcome,
} from "./player-state";

const graph = {
  nodes: [
    { id: "flow", kind: "flow" as const, parentId: null },
    { id: "scene", kind: "scene" as const, parentId: "flow" },
  ],
  edges: [],
  blocks: [],
  cues: [
    { id: "cue", name: "Cue", owner: { kind: "scene" as const, sceneId: "scene" }, actionIds: [] },
  ],
  actions: [],
  eventBindings: [
    {
      id: "tap-binding",
      canvasId: "canvas",
      elementId: "button",
      eventKind: "tap" as const,
      cueId: "cue",
      position: 0,
    },
    {
      id: "keypress-binding",
      canvasId: "canvas",
      elementId: "root",
      eventKind: "keypress" as const,
      params: { key: "k" },
      cueId: "cue",
      position: 1,
    },
  ],
  slotEventBindings: [],
} as unknown as ShowGraph;

const canvas = { root: { id: "root", type: "frame", children: [] } } as never;
const emptyState: RunState = { sourceValues: {}, structuredValues: {} };

/** A Shared Device's Cue: a Show write, a Navigate, and a Flow-local write from its Parameter. */
const writingGraph = {
  nodes: [
    { id: "flow", kind: "flow", name: "Flow", parentId: null, defaultSceneId: "scene" },
    { id: "scene", kind: "scene", name: "Scene", parentId: "flow", variables: [] },
    { id: "scene_next", kind: "scene", name: "Next", parentId: "flow", variables: [] },
    { id: "source_counter", kind: "source", name: "Counter", parentId: null, type: "number" },
    { id: "source_picked", kind: "source", name: "Picked", parentId: "flow", type: "number" },
  ],
  edges: [],
  blocks: [],
  cues: [
    {
      id: "cue",
      name: "Cue",
      owner: { kind: "scene", sceneId: "scene" },
      actionIds: ["action_count", "action_go", "action_pick"],
      parameters: [{ id: "amount", name: "Amount", type: "number", position: 0 }],
    },
  ],
  actions: [
    {
      id: "action_count",
      cueId: "cue",
      kind: "update",
      target: { sourceId: "source_counter", fieldPath: [] },
      operation: {
        kind: "adjust",
        operand: { kind: "literal", value: { kind: "number", value: 1 } },
      },
    },
    { id: "action_go", cueId: "cue", kind: "navigate", targetSceneId: "scene_next" },
    {
      id: "action_pick",
      cueId: "cue",
      kind: "update",
      target: { sourceId: "source_picked", fieldPath: [] },
      operation: {
        kind: "set",
        operand: { kind: "cueParameter", parameterId: "amount", fieldPath: [] },
      },
    },
  ],
  eventBindings: [
    {
      id: "tap-binding",
      canvasId: "canvas",
      elementId: "button",
      eventKind: "tap",
      cueId: "cue",
      position: 0,
      parameterMappings: [{ parameterId: "amount", source: { kind: "literal", value: 5 } }],
    },
  ],
  slotEventBindings: [],
} as unknown as ShowGraph;

const tap = {
  sceneId: "scene",
  canvasId: "canvas",
  elementId: "button",
  eventKind: "tap" as const,
};

/** The snapshot: both the Show Source and the Instance's Flow-local one. */
const snapshot: RunState = {
  sourceValues: { source_counter: 2, source_picked: 0 },
  structuredValues: {},
};

/** Taps once against `snapshot`, keeping the queue the way the Player does. */
async function tapWith(result: Promise<PlayerEventResult>) {
  let pending: readonly PendingShowEvent[] = [];
  const settled = vi.fn((eventId: string, outcome: ShowWriteOutcome) => {
    pending = resolvePendingShowEvent(pending, eventId, outcome);
  });
  const submitEvent = vi.fn<(input: PlayerEventInput) => Promise<PlayerEventResult>>(() => result);
  dispatchSharedPlayerEvent({
    graph: writingGraph,
    canvas,
    blocks: [],
    state: snapshot,
    observation: tap,
    publishedGraphVersion: 7,
    submitEvent,
    onPending: (event) => {
      pending = [...pending, event];
    },
    onSettled: settled,
    retry: { delays: [] },
  });
  const shownBeforeAnswer = displayedShowState(writingGraph, snapshot, 4, pending);
  await vi.waitFor(() => expect(settled).toHaveBeenCalled());
  return { submitEvent, shownBeforeAnswer, pending: () => pending };
}

describe("dispatchSharedPlayerEvent", () => {
  it.each([
    {
      name: "tap",
      observation: {
        sceneId: "scene",
        canvasId: "canvas",
        elementId: "button",
        eventKind: "tap" as const,
      },
    },
    {
      name: "keypress",
      observation: {
        sceneId: "scene",
        canvasId: "canvas",
        elementId: "root",
        eventKind: "keypress" as const,
        params: { key: "k" },
      },
    },
  ])("submits a resolved shared $name event", ({ observation }) => {
    const submitEvent = vi.fn(() =>
      Promise.resolve({ kind: "accepted" as const, eventId: "event-1", stateSequence: 1 }),
    );
    const onPending = vi.fn();

    expect(
      dispatchSharedPlayerEvent({
        graph,
        canvas,
        blocks: [],
        state: emptyState,
        observation,
        publishedGraphVersion: 7,
        submitEvent,
        onPending,
        onSettled: vi.fn(),
      }),
    ).toBe(true);
    expect(submitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        publishedGraphVersion: 7,
        sceneId: "scene",
        elementId: observation.elementId,
        eventKind: observation.eventKind,
      }),
    );
    // A Cue that writes nothing has nothing to show ahead of the server.
    expect(onPending).not.toHaveBeenCalled();
  });

  it("shows a Cue's Show and Flow-local writes before the server answers, and not its Navigate (#887)", async () => {
    const { submitEvent, shownBeforeAnswer, pending } = await tapWith(
      Promise.resolve({
        kind: "applied",
        eventId: "e",
        resultingSceneId: "scene_next",
        changed: true,
        stateSequence: 5,
      }),
    );

    expect(shownBeforeAnswer.sourceValues).toEqual({ source_counter: 3, source_picked: 5 });
    const [event] = pending();
    expect(event?.actions.map(({ action }) => action.id)).toEqual(["action_count", "action_pick"]);
    // Submitted as a Shared Device's Event: the server resolves its own evidence.
    expect(submitEvent.mock.calls[0]?.[0]).not.toHaveProperty("evidence");
    expect(event?.eventId).toBe(submitEvent.mock.calls[0]?.[0].eventId);
    // Kept until a snapshot at the acknowledged sequence holds it.
    expect(event?.acknowledgedStateSequence).toBe(5);
    expect(displayedShowState(writingGraph, snapshot, 4, pending()).sourceValues).toEqual({
      source_counter: 3,
      source_picked: 5,
    });
    expect(
      displayedShowState(
        writingGraph,
        { ...snapshot, sourceValues: { source_counter: 3, source_picked: 5 } },
        5,
        pending(),
      ).sourceValues,
    ).toEqual({ source_counter: 3, source_picked: 5 });
  });

  it("removes the prediction when the server fails the Cue", async () => {
    const { shownBeforeAnswer, pending } = await tapWith(
      Promise.resolve({ kind: "failed", eventId: "e", actionId: "action_count", reason: "r" }),
    );

    expect(shownBeforeAnswer.sourceValues).toEqual({ source_counter: 3, source_picked: 5 });
    expect(pending()).toEqual([]);
    expect(displayedShowState(writingGraph, snapshot, 4, pending())).toBe(snapshot);
  });

  it("removes the prediction once every retry has failed", async () => {
    const { submitEvent, pending } = await tapWith(
      Promise.reject(new TypeError("Failed to fetch")),
    );

    expect(submitEvent).toHaveBeenCalledTimes(1);
    expect(pending()).toEqual([]);
  });
  it("does not submit an unbound keypress", () => {
    const submitEvent = vi.fn(() =>
      Promise.resolve({ kind: "accepted" as const, eventId: "event-1", stateSequence: 1 }),
    );

    expect(
      dispatchSharedPlayerEvent({
        graph,
        canvas,
        blocks: [],
        state: emptyState,
        observation: {
          sceneId: "scene",
          canvasId: "canvas",
          elementId: "root",
          eventKind: "keypress",
          params: { key: "x" },
        },
        publishedGraphVersion: 7,
        submitEvent,
        onPending: vi.fn(),
        onSettled: vi.fn(),
      }),
    ).toBe(false);
    expect(submitEvent).not.toHaveBeenCalled();
  });
});

describe("submitPlayerEventWithRetry", () => {
  const input: PlayerEventInput = {
    eventId: "event-1",
    publishedGraphVersion: 7,
    sceneId: "scene",
    elementId: "element",
    eventKind: "tap",
  };
  const noWait = () => Promise.resolve();

  it("retries a lost acknowledgement with the same Event id, which the server counts once", async () => {
    const duplicate: PlayerEventResult = {
      kind: "duplicate",
      eventId: "event-1",
      outcome: "accepted",
      changed: true,
      resultingSceneId: null,
      reason: null,
      stateSequence: 9,
    };
    const submitEvent = vi
      .fn<(event: PlayerEventInput) => Promise<PlayerEventResult>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(duplicate);

    const result = await submitPlayerEventWithRetry(submitEvent, input, { wait: noWait });

    expect(submitEvent.mock.calls.map(([event]) => event.eventId)).toEqual(["event-1", "event-1"]);
    expect(showWriteOutcome(result)).toEqual({ kind: "acknowledged", stateSequence: 9 });
  });

  it("gives up only after the last retry", async () => {
    const submitEvent = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    const waits: number[] = [];

    await expect(
      submitPlayerEventWithRetry(submitEvent, input, {
        delays: [10, 20],
        wait: (ms) => {
          waits.push(ms);
          return Promise.resolve();
        },
      }),
    ).rejects.toThrow("Failed to fetch");
    expect(submitEvent).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([10, 20]);
  });
});

describe("showWriteOutcome", () => {
  it.each<[string, PlayerEventResult, ShowWriteOutcome]>([
    [
      "applied",
      { kind: "applied", eventId: "e", resultingSceneId: "s", changed: true, stateSequence: 4 },
      { kind: "acknowledged", stateSequence: 4 },
    ],
    [
      "accepted",
      { kind: "accepted", eventId: "e", stateSequence: 4 },
      { kind: "acknowledged", stateSequence: 4 },
    ],
    [
      "failed",
      { kind: "failed", eventId: "e", actionId: "a", reason: "r" },
      { kind: "rolled-back" },
    ],
    ["rejected", { kind: "rejected", eventId: "e", reason: "r" }, { kind: "rolled-back" }],
    ["ignored", { kind: "ignored", eventId: "e", reason: "stale-scene" }, { kind: "dropped" }],
    [
      "a duplicate of a failure",
      {
        kind: "duplicate",
        eventId: "e",
        outcome: "failed",
        changed: false,
        resultingSceneId: null,
        reason: "r",
        stateSequence: null,
      },
      { kind: "rolled-back" },
    ],
    [
      "a duplicate recorded without a sequence",
      {
        kind: "duplicate",
        eventId: "e",
        outcome: "accepted",
        changed: true,
        resultingSceneId: null,
        reason: null,
        stateSequence: null,
      },
      { kind: "dropped" },
    ],
  ])("reads %s", (_name, result, outcome) => {
    expect(showWriteOutcome(result)).toEqual(outcome);
  });
});
