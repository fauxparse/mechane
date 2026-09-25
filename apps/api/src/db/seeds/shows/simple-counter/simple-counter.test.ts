import { assertValidCanvas } from "@mechane/domain/canvas";
import { assertValidShowGraph } from "@mechane/domain/graph";
import { describe, expect, it } from "vitest";

import { readActiveRun, startRun } from "../../../runs";
import { dispatchPlayerEvent } from "../../../player-events";
import { readPlayerSession } from "../../../../player";
import { readShowGraph } from "../../../show-graph";
import { setupPostgresTest } from "../../../test-helpers";
import {
  COUNTER_ACTION_ID,
  COUNTER_BUTTON_ID,
  COUNTER_CUE_ID,
  COUNTER_DEVICE_ID,
  COUNTER_SCENE_ID,
  COUNTER_SOURCE_ID,
  COUNTER_VARIABLE_ID,
  counterCanvases,
  counterGraph,
  seedShow,
} from "./simple-counter";

const { showId, createShow } = setupPostgresTest("simple-counter-test");

describe("Simple Counter seed", () => {
  it("builds one connected scene with an increment interaction", () => {
    const graph = counterGraph();
    expect(() => assertValidShowGraph(graph)).not.toThrow();

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: COUNTER_SOURCE_ID, kind: "source", type: "number" }),
        expect.objectContaining({
          id: COUNTER_SCENE_ID,
          kind: "scene",
          parentId: null,
          variables: [{ id: COUNTER_VARIABLE_ID, name: "Counter", type: "number" }],
        }),
        expect.objectContaining({ id: COUNTER_DEVICE_ID, kind: "device", perConnection: false }),
      ]),
    );
    expect(graph.nodes.filter((node) => node.kind === "scene")).toHaveLength(1);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "wiring",
          sourceId: COUNTER_SOURCE_ID,
          targetId: COUNTER_SCENE_ID,
          targetPath: [COUNTER_VARIABLE_ID],
        }),
        expect.objectContaining({
          kind: "update",
          actionId: COUNTER_ACTION_ID,
          cueId: COUNTER_CUE_ID,
          sourceId: COUNTER_SCENE_ID,
          targetId: COUNTER_SOURCE_ID,
        }),
        expect.objectContaining({
          kind: "device",
          sourceId: COUNTER_SCENE_ID,
          targetId: COUNTER_DEVICE_ID,
        }),
      ]),
    );
    expect(graph.actions).toEqual([
      expect.objectContaining({
        id: COUNTER_ACTION_ID,
        cueId: COUNTER_CUE_ID,
        operation: {
          kind: "adjust",
          operand: { kind: "literal", value: { kind: "number", value: 1 } },
        },
      }),
    ]);
    expect(graph.eventBindings).toEqual([
      expect.objectContaining({
        elementId: COUNTER_BUTTON_ID,
        eventKind: "tap",
        cueId: COUNTER_CUE_ID,
      }),
    ]);
  });

  it("connects the counter text to the number Variable", () => {
    const canvas = counterCanvases()[COUNTER_SCENE_ID];
    if (!canvas) throw new Error("Counter Scene Canvas is missing.");
    expect(() => assertValidCanvas(canvas)).not.toThrow();
    expect(canvas.root.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          content: { kind: "variable", variableId: COUNTER_VARIABLE_ID },
        }),
        expect.objectContaining({ id: COUNTER_BUTTON_ID, type: "frame" }),
      ]),
    );
  });

  it("increments the connected value when the seeded button is tapped", async () => {
    await createShow();
    await seedShow.seed(showId);

    const published = await readShowGraph(showId, "published");
    const device = published.nodes.find((node) => node.id === COUNTER_DEVICE_ID);
    if (device?.kind !== "device" || !device.pairingCode) {
      throw new Error("Simple Counter pairing code was not minted.");
    }

    const run = await startRun(showId);
    const before = await readPlayerSession(device.pairingCode);
    expect(before?.scene?.id).toBe(COUNTER_SCENE_ID);
    expect(before?.run?.sourceValues[COUNTER_SOURCE_ID]).toBe(0);

    const result = await dispatchPlayerEvent(device.pairingCode, {
      eventId: crypto.randomUUID(),
      publishedGraphVersion: published.version,
      sceneId: COUNTER_SCENE_ID,
      elementId: COUNTER_BUTTON_ID,
      eventKind: "tap",
    });

    expect(result).toMatchObject({ kind: "accepted" });
    expect((await readActiveRun(showId))?.sourceValues[COUNTER_SOURCE_ID]).toBe(1);
    expect(
      (await readPlayerSession(device.pairingCode))?.run?.sourceValues[COUNTER_SOURCE_ID],
    ).toBe(1);
    expect((await readPlayerSession(device.pairingCode))?.scene?.id).toBe(COUNTER_SCENE_ID);
    expect(run.id).toBe((await readActiveRun(showId))?.id);
  });
});
