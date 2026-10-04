import { describe, expect, it, vi } from "vitest";

import type { PlayerEventInput, PlayerEventResult } from "./api";
import {
  dispatchSharedPlayerEvent,
  showWriteOutcome,
  submitPlayerEventWithRetry,
} from "./player-event-dispatch";
import type { ShowWriteOutcome } from "./player-state";

const graph = {
  nodes: [
    { id: "flow", kind: "flow" as const, parentId: null },
    { id: "scene", kind: "scene" as const, parentId: "flow" },
  ],
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
};

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

    expect(
      dispatchSharedPlayerEvent({
        graph,
        observation,
        publishedGraphVersion: 7,
        submitEvent,
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
  });

  it("does not submit an unbound keypress", () => {
    const submitEvent = vi.fn(() =>
      Promise.resolve({ kind: "accepted" as const, eventId: "event-1", stateSequence: 1 }),
    );

    expect(
      dispatchSharedPlayerEvent({
        graph,
        observation: {
          sceneId: "scene",
          canvasId: "canvas",
          elementId: "root",
          eventKind: "keypress",
          params: { key: "x" },
        },
        publishedGraphVersion: 7,
        submitEvent,
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
