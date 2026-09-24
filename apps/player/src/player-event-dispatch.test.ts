import { describe, expect, it, vi } from "vitest";

import { dispatchSharedPlayerEvent } from "./player-event-dispatch";

const graph = {
  nodes: [
    { id: "flow", kind: "flow" as const, parentId: null },
    { id: "scene", kind: "scene" as const, parentId: "flow" },
  ],
  blocks: [],
  cues: [{ id: "cue", name: "Cue", owner: { kind: "scene" as const, sceneId: "scene" }, actionIds: [] }],
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
      Promise.resolve({ kind: "accepted" as const, eventId: "event-1" }),
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
      Promise.resolve({ kind: "accepted" as const, eventId: "event-1" }),
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
