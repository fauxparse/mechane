import type { ShowGraph } from "@mechane/domain";
import { describeRunError } from "@mechane/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "./client";
import { readCanvas } from "./canvas";
import { dispatchPlayerEvent } from "./player-events";
import { listRunErrors, RunConfigurationError } from "./run-errors";
import { endRun, readActiveRun, readRunDeviceState, startRun } from "./runs";
import { publishShowGraph, readShowGraph, writeShowGraph } from "./show-graph";
import {
  playerEvents,
  playerInvalidationOutbox,
  runDeviceStates,
  runStructuredValues,
} from "./schema";
import { setupPostgresTest } from "./test-helpers";
import { seedShow } from "./seeds/shows/navigation-proof/navigation-proof";

const { showId, createShow: createUserAndShow } = setupPostgresTest("player-events-db-test");

async function createShow(): Promise<void> {
  await createUserAndShow("Player Events DB Test");
  await seedShow.seed(showId);
}

async function proofDevice(): Promise<{ id: string; pairingCode: string }> {
  const graph = await readShowGraph(showId, "published");
  const device = graph.nodes.find((node) => node.kind === "device");
  if (device?.kind !== "device" || !device.pairingCode)
    throw new Error("Proof Device is incomplete.");
  return { id: device.id, pairingCode: device.pairingCode };
}

function event(eventId: string, sceneId: string, destinationId: string) {
  return {
    eventId,
    publishedGraphVersion: 1,
    sceneId,
    elementId: `button_${sceneId}_${destinationId}`,
    eventKind: "tap",
  } as const;
}

describe("dispatchPlayerEvent", () => {
  it("applies all six Navigation Proof transitions", async () => {
    await createShow();
    const device = await proofDevice();
    const run = await startRun(showId);
    const transitions = [
      ["scene_red", "scene_green"],
      ["scene_green", "scene_red"],
      ["scene_red", "scene_blue"],
      ["scene_blue", "scene_red"],
      ["scene_red", "scene_green"],
      ["scene_green", "scene_blue"],
      ["scene_blue", "scene_green"],
    ] as const;

    for (const [sceneId, destinationId] of transitions) {
      const result = await dispatchPlayerEvent(
        device.pairingCode,
        event(crypto.randomUUID(), sceneId, destinationId),
      );
      expect(result).toMatchObject({ kind: "applied", resultingSceneId: destinationId });
    }
    expect((await readRunDeviceState(run.id, device.id))?.activeSceneId).toBe("scene_green");
    expect(await db.select().from(playerEvents).where(eq(playerEvents.runId, run.id))).toHaveLength(
      7,
    );
    await endRun(showId);
    expect(await db.select().from(playerEvents).where(eq(playerEvents.runId, run.id))).toHaveLength(
      0,
    );
  });
  it("dispatches Adjust Update Actions and updates the Run value", async () => {
    await createShow();
    const draft = await readShowGraph(showId, "draft");
    const redCanvas = await readCanvas(showId, "draft", { sceneNodeId: "scene_red" });
    if (!redCanvas) throw new Error("Red Scene Canvas is missing.");
    const sourceId = "source_counter";
    const cueId = "cue_counter";
    const actionId = "action_counter";
    await writeShowGraph(showId, "draft", {
      ...draft,
      nodes: [
        ...draft.nodes,
        {
          id: sourceId,
          kind: "source",
          name: "Counter",
          position: { x: 0, y: 0 },
          parentId: null,
          type: "number",
        },
      ],
      cues: [
        ...(draft.cues ?? []),
        {
          id: cueId,
          name: "Increment",
          owner: { kind: "scene", sceneId: "scene_red" },
          actionIds: [actionId],
        },
      ],
      actions: [
        ...(draft.actions ?? []),
        {
          id: actionId,
          cueId,
          kind: "update",
          target: { sourceId, fieldPath: [] },
          operation: {
            kind: "adjust",
            operand: { kind: "literal", value: { kind: "number", value: 1 } },
          },
        },
      ],
      eventBindings: [
        ...(draft.eventBindings ?? []),
        {
          id: "binding_counter",
          canvasId: redCanvas.id,
          elementId: "scene_red_root",
          eventKind: "tap",
          cueId,
          position: 5,
        },
      ],
    });
    const published = await publishShowGraph(showId);
    const run = await startRun(showId);
    const device = await proofDevice();

    const result = await dispatchPlayerEvent(device.pairingCode, {
      eventId: crypto.randomUUID(),
      publishedGraphVersion: published.version,
      sceneId: "scene_red",
      elementId: "scene_red_root",
      eventKind: "tap",
    });

    expect(result).toMatchObject({ kind: "accepted" });
    expect((await readActiveRun(showId))?.sourceValues[sourceId]).toBe(1);
    expect((await readRunDeviceState(run.id, device.id))?.activeSceneId).toBe("scene_red");
  });
  it("adjusts a nested Field without re-keying any Structured Value (#635)", async () => {
    await createShow();
    const draft = await readShowGraph(showId, "draft");
    const redCanvas = await readCanvas(showId, "draft", { sceneNodeId: "scene_red" });
    if (!redCanvas) throw new Error("Red Scene Canvas is missing.");
    const shapeId = "shape_candidate";
    const sourceId = "source_candidate";
    const cueId = "cue_vote";
    const actionId = "action_vote";

    await writeShowGraph(showId, "draft", {
      ...draft,
      shapes: [
        ...(draft.shapes ?? []),
        {
          id: shapeId,
          name: "Candidate",
          fields: [
            { id: "f_name", name: "Name", type: "text", required: true, defaultValue: "Alice" },
            { id: "f_votes", name: "Votes", type: "number", required: true, defaultValue: 0 },
          ],
        },
      ],
      nodes: [
        ...draft.nodes,
        {
          id: sourceId,
          kind: "source",
          name: "Candidate",
          position: { x: 0, y: 0 },
          parentId: null,
          type: { kind: "shape", shapeId },
        },
      ],
      cues: [
        ...(draft.cues ?? []),
        { id: cueId, name: "Vote", owner: { kind: "scene", sceneId: "scene_red" }, actionIds: [actionId] },
      ],
      actions: [
        ...(draft.actions ?? []),
        {
          id: actionId,
          cueId,
          kind: "update",
          target: { sourceId, fieldPath: ["f_votes"] },
          operation: {
            kind: "adjust",
            operand: { kind: "literal", value: { kind: "number", value: 1 } },
          },
        },
      ],
      eventBindings: [
        ...(draft.eventBindings ?? []),
        {
          id: "binding_vote",
          canvasId: redCanvas.id,
          elementId: "scene_red_root",
          eventKind: "tap",
          cueId,
          position: 5,
        },
      ],
    });

    const published = await publishShowGraph(showId);
    const run = await startRun(showId);
    const device = await proofDevice();

    const before = await db
      .select()
      .from(runStructuredValues)
      .where(eq(runStructuredValues.runId, run.id));
    const beforeIds = before.map((row) => row.structuredValueId).sort();
    expect(beforeIds.length).toBeGreaterThan(0);

    const result = await dispatchPlayerEvent(device.pairingCode, {
      eventId: crypto.randomUUID(),
      publishedGraphVersion: published.version,
      sceneId: "scene_red",
      elementId: "scene_red_root",
      eventKind: "tap",
    });
    expect(result).toMatchObject({ kind: "accepted" });

    const after = await db
      .select()
      .from(runStructuredValues)
      .where(eq(runStructuredValues.runId, run.id));

    // The regression: the old write path minted a fresh identity for every
    // record it touched and left the originals behind as orphans.
    expect(after.map((row) => row.structuredValueId).sort()).toEqual(beforeIds);

    const candidate = after.find((row) => row.structuredValueId === beforeIds[0]);
    if (!candidate) throw new Error("Candidate record is missing.");
    const values = await readActiveRun(showId);
    if (!values) throw new Error("Run is missing.");

    // The Source still points at the record it always pointed at, and the
    // write landed inside that record rather than replacing it.
    expect((values.sourceValues[sourceId] as { ref: string }).ref).toBe(beforeIds[0]);
    expect((candidate.payload as { f_votes: number }).f_votes).toBe(1);
  });

  it("ignores Events when there is no active Run", async () => {
    await createShow();
    const device = await proofDevice();
    await expect(
      dispatchPlayerEvent(
        device.pairingCode,
        event(crypto.randomUUID(), "scene_red", "scene_green"),
      ),
    ).resolves.toMatchObject({ kind: "ignored", reason: "no-active-run" });
  });

  it("serializes concurrent taps and records the stale loser", async () => {
    await createShow();
    const device = await proofDevice();
    const run = await startRun(showId);
    const results = await Promise.all([
      dispatchPlayerEvent(
        device.pairingCode,
        event(crypto.randomUUID(), "scene_red", "scene_green"),
      ),
      dispatchPlayerEvent(
        device.pairingCode,
        event(crypto.randomUUID(), "scene_red", "scene_green"),
      ),
    ]);
    expect(results.map((result) => result?.kind).sort()).toEqual(["applied", "ignored"]);
    expect(results.find((result) => result?.kind === "ignored")).toMatchObject({
      reason: "stale-scene",
    });
    expect((await readRunDeviceState(run.id, device.id))?.activeSceneId).toBe("scene_green");
  });

  it("returns safe ignored outcomes for unbound and not-ready Events", async () => {
    await createShow();
    const device = await proofDevice();
    const run = await startRun(showId);

    await expect(
      dispatchPlayerEvent(device.pairingCode, {
        eventId: crypto.randomUUID(),
        publishedGraphVersion: 1,
        sceneId: "scene_red",
        elementId: "missing_element",
        eventKind: "tap",
      }),
    ).resolves.toMatchObject({ kind: "ignored", reason: "unbound-event" });

    await db
      .update(runDeviceStates)
      .set({ activeSceneId: null })
      .where(eq(runDeviceStates.runId, run.id));
    await expect(
      dispatchPlayerEvent(
        device.pairingCode,
        event(crypto.randomUUID(), "scene_red", "scene_green"),
      ),
    ).resolves.toMatchObject({ kind: "ignored", reason: "not-ready" });
  });

  it("records ignored Events for a Device without navigation state", async () => {
    await createShow();
    const device = await proofDevice();
    const directGraph: ShowGraph = {
      nodes: [
        {
          id: "scene_direct",
          kind: "scene",
          name: "Direct",
          position: { x: 0, y: 0 },
          parentId: null,
          variables: [],
        },
        {
          id: "device_navigation",
          kind: "device",
          name: "Navigation Device",
          position: { x: 0, y: 100 },
          parentId: null,
          perConnection: false,
          pairingCode: null,
        },
      ],
      edges: [
        {
          id: "edge_direct_device",
          kind: "device",
          sourceId: "scene_direct",
          targetId: "device_navigation",
          sourcePath: [],
          targetPath: [],
        },
      ],
    };
    await writeShowGraph(showId, "draft", directGraph);
    await publishShowGraph(showId);
    const run = await startRun(showId);
    await expect(
      dispatchPlayerEvent(device.pairingCode, {
        eventId: crypto.randomUUID(),
        publishedGraphVersion: 1,
        sceneId: "scene_red",
        elementId: "button_scene_red_scene_green",
        eventKind: "tap",
      }),
    ).resolves.toMatchObject({ kind: "ignored", reason: "no-navigation-state" });
    expect(await db.select().from(playerEvents).where(eq(playerEvents.runId, run.id))).toHaveLength(
      1,
    );
  });
  it("fails closed when persisted navigation configuration is contradictory", async () => {
    await createShow();
    const device = await proofDevice();
    const run = await startRun(showId);
    await db
      .update(runDeviceStates)
      .set({ flowId: "missing_flow" })
      .where(eq(runDeviceStates.runId, run.id));

    await expect(
      dispatchPlayerEvent(
        device.pairingCode,
        event(crypto.randomUUID(), "scene_red", "scene_green"),
      ),
    ).rejects.toBeInstanceOf(RunConfigurationError);

    // The dispatch transaction rolled back, so the Event ledger records
    // nothing at all — which is exactly why the failure has to be written
    // somewhere else for whoever is running the show.
    expect(await db.select().from(playerEvents).where(eq(playerEvents.runId, run.id))).toHaveLength(
      0,
    );
    const logged = await listRunErrors(showId);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      showId,
      runId: run.id,
      category: "invalidNavigateAction",
      deviceId: device.id,
      sceneId: "scene_red",
    });
    expect(describeRunError(logged[0]!)).toContain("Navigate Action");
  });
  it("accepts per-connection Events without server navigation state", async () => {
    await createShow();
    const draft = await readShowGraph(showId, "draft");
    const audienceGraph: ShowGraph = {
      ...draft,
      nodes: draft.nodes.map((node) =>
        node.kind === "device" ? { ...node, perConnection: true } : node,
      ),
    };
    await writeShowGraph(showId, "draft", audienceGraph);
    await publishShowGraph(showId);
    const run = await startRun(showId);
    const published = await readShowGraph(showId, "published");
    const device = published.nodes.find((node) => node.kind === "device");
    if (device?.kind !== "device" || !device.pairingCode)
      throw new Error("Audience Device is incomplete.");
    const beforeOutbox = await db
      .select()
      .from(playerInvalidationOutbox)
      .where(eq(playerInvalidationOutbox.showId, showId));
    const input = event(crypto.randomUUID(), "scene_red", "scene_green");
    const result = await dispatchPlayerEvent(device.pairingCode, {
      ...input,
      publishedGraphVersion: published.version,
    });

    expect(result).toEqual({ kind: "accepted", eventId: input.eventId });
    expect(await readRunDeviceState("missing", device.id)).toBeNull();
    expect(await readRunDeviceState(run.id, device.id)).toBeNull();
    const rows = await db.select().from(playerEvents).where(eq(playerEvents.runId, run.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      outcome: "accepted",
      resultingSceneId: "scene_green",
      publishedGraphVersion: published.version,
    });
    expect(
      await db
        .select()
        .from(playerInvalidationOutbox)
        .where(eq(playerInvalidationOutbox.showId, showId)),
    ).toHaveLength(beforeOutbox.length);
  });
});
