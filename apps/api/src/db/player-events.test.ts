import type { ShowGraph } from "@mechane/domain/graph";
import type { Action } from "@mechane/domain/interactions";
import { describeRunError } from "@mechane/domain/run-errors";
import {
  isStructuredValueReference,
  type RunState,
  type StructuredValueReference,
} from "@mechane/domain/structured-values";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "./client";
import { readCanvas, writeCanvas } from "./canvas";
import { dispatchPlayerEvent, type PlayerActionEvidence } from "./player-events";
import { listRunErrors, RunConfigurationError } from "./run-errors";
import { endRun, readActiveRun, readRunDeviceState, readRunState, startRun } from "./runs";
import { applyShowEdits, publishShowGraph, readShowGraph, writeShowGraph } from "./show-graph";
import {
  playerEvents,
  playerInvalidationOutbox,
  runDeviceStates,
  runStructuredValues,
  shows,
} from "./schema";
import { setupPostgresTest } from "./test-helpers";
import { seedShowData } from "./seeds/utils/seed-utils";
import {
  navigationProofCanvases,
  navigationProofGraph,
} from "./seeds/shows/navigation-proof/navigation-proof";

const { showId, createShow: createUserAndShow } = setupPostgresTest("player-events-db-test");
const SMALL_SCENE_IDS: Record<string, true> = { scene_red: true, scene_green: true };

function smallNavigationGraph(): ShowGraph {
  const graph = navigationProofGraph();
  const nodes = graph.nodes.filter(
    (node) =>
      node.id === "flow_navigation" ||
      node.id === "scene_red" ||
      node.id === "scene_green" ||
      node.id === "device_navigation",
  );
  const nodeIds = new Set(nodes.map((node) => node.id));
  const candidateCues = (graph.cues ?? []).filter(
    (cue) => cue.owner.kind === "scene" && SMALL_SCENE_IDS[cue.owner.sceneId] === true,
  );
  const candidateCueIds = new Set(candidateCues.map((cue) => cue.id));
  const candidateActions = (graph.actions ?? []).filter(
    (action) =>
      candidateCueIds.has(action.cueId) &&
      action.kind === "navigate" &&
      SMALL_SCENE_IDS[action.targetSceneId] === true,
  );
  const actionIds = new Set(candidateActions.map((action) => action.id));
  const cues = candidateCues.filter((cue) =>
    cue.actionIds.every((actionId) => actionIds.has(actionId)),
  );
  const cueIds = new Set(cues.map((cue) => cue.id));
  const actions = candidateActions.filter((action) => cueIds.has(action.cueId));
  return {
    ...graph,
    nodes,
    edges: graph.edges.filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)),
    cues,
    actions,
    eventBindings: (graph.eventBindings ?? []).filter((binding) => cueIds.has(binding.cueId)),
  };
}

function smallNavigationCanvases() {
  const canvases = navigationProofCanvases();
  const sceneRed = canvases.scene_red;
  const sceneGreen = canvases.scene_green;
  if (!sceneRed || !sceneGreen) throw new Error("Navigation canvases are incomplete.");
  return { scene_red: sceneRed, scene_green: sceneGreen };
}

async function createShow(fullNavigation = false): Promise<void> {
  await createUserAndShow("Player Events DB Test");
  await seedShowData(
    showId,
    fullNavigation ? navigationProofGraph : smallNavigationGraph,
    fullNavigation ? navigationProofCanvases : smallNavigationCanvases,
  );
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

const MULTI_CUE_ID = "cue_multi";
const CANDIDATE_TYPE = { kind: "shape", shapeId: "shape_candidate" } as const;

function adjust(id: string, sourceId: string, fieldPath: string[], value: number): Action {
  return {
    id,
    cueId: MULTI_CUE_ID,
    kind: "update",
    target: { sourceId, fieldPath },
    operation: { kind: "adjust", operand: { kind: "literal", value: { kind: "number", value } } },
  };
}

/**
 * Publishes one Cue, bound to a tap on Red's root, over a Show-scoped Counter
 * and Candidates and a Flow-local Selected, then starts a Run.
 */
async function publishMultiActionCue(actions: Action[], perConnection: boolean) {
  await createShow();
  const draft = await readShowGraph(showId, "draft");
  const redCanvas = await readCanvas(showId, "draft", { sceneNodeId: "scene_red" });
  if (!redCanvas) throw new Error("Red Scene Canvas is missing.");
  await writeShowGraph(showId, "draft", {
    ...draft,
    shapes: [
      ...(draft.shapes ?? []),
      {
        id: CANDIDATE_TYPE.shapeId,
        name: "Candidate",
        fields: [
          { id: "f_name", name: "Name", type: "text", required: true, defaultValue: "" },
          { id: "f_votes", name: "Votes", type: "number", required: true, defaultValue: 0 },
        ],
      },
    ],
    sourceFieldDefaults: [
      ...(draft.sourceFieldDefaults ?? []),
      {
        nodeId: "source_candidates",
        fieldPath: [],
        value: [
          { f_name: "X", f_votes: 0 },
          { f_name: "Y", f_votes: 0 },
        ],
      },
      { nodeId: "source_selected", fieldPath: [], value: null },
    ],
    nodes: [
      ...draft.nodes.map((node) => (node.kind === "device" ? { ...node, perConnection } : node)),
      {
        id: "source_counter",
        kind: "source",
        name: "Counter",
        position: { x: 0, y: 0 },
        parentId: null,
        type: "number",
      },
      {
        id: "source_candidates",
        kind: "source",
        name: "Candidates",
        position: { x: 0, y: 0 },
        parentId: null,
        type: { kind: "array", of: CANDIDATE_TYPE },
      },
      {
        id: "source_selected",
        kind: "source",
        name: "Selected",
        position: { x: 0, y: 0 },
        parentId: "flow_navigation",
        type: CANDIDATE_TYPE,
      },
    ],
    cues: [
      ...(draft.cues ?? []),
      {
        id: MULTI_CUE_ID,
        name: "Multi",
        owner: { kind: "scene", sceneId: "scene_red" },
        actionIds: actions.map((action) => action.id),
        parameters: [{ id: "candidate", name: "Candidate", type: CANDIDATE_TYPE, position: 0 }],
      },
    ],
    actions: [...(draft.actions ?? []), ...actions],
    eventBindings: [
      ...(draft.eventBindings ?? []),
      {
        id: "binding_multi",
        canvasId: redCanvas.id,
        elementId: "scene_red_root",
        eventKind: "tap",
        cueId: MULTI_CUE_ID,
        position: 5,
        // A per-connection Player resolves this itself and sends it as
        // evidence; the literal only satisfies the one-mapping-per-Parameter rule.
        parameterMappings: [{ parameterId: "candidate", source: { kind: "literal", value: null } }],
      },
    ],
  });
  const published = await publishShowGraph(showId);
  const run = await startRun(showId);
  const device = await proofDevice();
  const state = await readRunState(run.id, db);
  const listRef = state.sourceValues.source_candidates;
  const list = isStructuredValueReference(listRef) ? state.structuredValues[listRef.ref] : null;
  if (list?.kind !== "array") throw new Error("Candidates were not materialized.");
  const [x, y] = list.items;
  if (!isStructuredValueReference(x) || !isStructuredValueReference(y)) {
    throw new Error("Candidates are incomplete.");
  }
  return { published, run, device, x, y };
}

async function tapRed(
  pairingCode: string,
  publishedGraphVersion: number,
  evidence?: Record<string, PlayerActionEvidence>,
) {
  return dispatchPlayerEvent(pairingCode, {
    eventId: crypto.randomUUID(),
    publishedGraphVersion,
    sceneId: "scene_red",
    elementId: "scene_red_root",
    eventKind: "tap",
    ...(evidence ? { evidence } : {}),
  });
}

async function stateSequence(): Promise<number> {
  const [show] = await db
    .select({ stateSequence: shows.stateSequence })
    .from(shows)
    .where(eq(shows.id, showId));
  if (!show) throw new Error("Show is missing.");
  return show.stateSequence;
}

function votes(state: RunState, ref: StructuredValueReference): unknown {
  const record = state.structuredValues[ref.ref];
  return record?.kind === "shape" ? record.fields.f_votes : undefined;
}

describe("dispatchPlayerEvent", () => {
  it("applies all six Navigation Proof transitions", async () => {
    await createShow(true);
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
  it("dispatches an Update Action from a top-level Scene on a shared Device", async () => {
    await createShow();
    const draft = await readShowGraph(showId, "draft");
    const scene = draft.nodes.find((node) => node.id === "scene_red");
    const device = draft.nodes.find((node) => node.kind === "device");
    const canvas = await readCanvas(showId, "draft", { sceneNodeId: "scene_red" });
    if (scene?.kind !== "scene" || device?.kind !== "device" || !canvas) {
      throw new Error("Direct Device fixture is incomplete.");
    }

    const sourceId = "source_direct_counter";
    const cueId = "cue_direct_counter";
    const actionId = "action_direct_counter";
    await writeShowGraph(showId, "draft", {
      ...draft,
      nodes: [
        { ...scene, parentId: null, name: "Direct Counter" },
        device,
        {
          id: sourceId,
          kind: "source",
          name: "Counter",
          position: { x: 0, y: 0 },
          parentId: null,
          type: "number",
        },
      ],
      edges: [
        {
          id: "edge_direct_counter_device",
          kind: "device",
          sourceId: scene.id,
          targetId: device.id,
          sourcePath: [],
          targetPath: [],
        },
      ],
      cues: [
        {
          id: cueId,
          name: "Increment",
          owner: { kind: "scene", sceneId: scene.id },
          actionIds: [actionId],
        },
      ],
      actions: [
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
      eventBindings: [],
    });
    const directCanvas = await writeCanvas(showId, "draft", { sceneNodeId: scene.id }, canvas);
    const graphWithCanvas = await readShowGraph(showId, "draft");
    await applyShowEdits(
      showId,
      [
        {
          type: "graph.addEventBinding",
          binding: {
            id: "binding_direct_counter",
            canvasId: directCanvas.id,
            elementId: directCanvas.root.id,
            eventKind: "tap",
            cueId,
            position: 0,
          },
        },
      ],
      [],
      graphWithCanvas.version,
    );
    const published = await publishShowGraph(showId);
    await startRun(showId);
    const pairedDevice = await proofDevice();

    const result = await dispatchPlayerEvent(pairedDevice.pairingCode, {
      eventId: crypto.randomUUID(),
      publishedGraphVersion: published.version,
      sceneId: scene.id,
      elementId: directCanvas.root.id,
      eventKind: "tap",
    });

    expect(result).toMatchObject({ kind: "accepted" });
    expect((await readActiveRun(showId))?.sourceValues[sourceId]).toBe(1);
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
        {
          id: cueId,
          name: "Vote",
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

  describe("a Cue with several Actions (#883)", () => {
    it("adjusts the Candidate the Cue selected, not the one selected before the tap", async () => {
      const { published, run, device, x, y } = await publishMultiActionCue(
        [
          {
            id: "action_select",
            cueId: MULTI_CUE_ID,
            kind: "update",
            target: { sourceId: "source_selected", fieldPath: [] },
            operation: {
              kind: "set",
              operand: { kind: "cueParameter", parameterId: "candidate", fieldPath: [] },
            },
          },
          adjust("action_vote", "source_selected", ["f_votes"], 1),
          {
            id: "action_thanks",
            cueId: MULTI_CUE_ID,
            kind: "navigate",
            targetSceneId: "scene_green",
          },
        ],
        true,
      );

      // The Player held Y before the tap; the vote's evidence is what
      // `selected` held once the set before it had run.
      const result = await tapRed(device.pairingCode, published.version, {
        action_vote: { sourceValues: { source_selected: x }, cueParameters: { candidate: x } },
      });

      expect(result).toMatchObject({ kind: "accepted" });
      const state = await readRunState(run.id, db);
      expect(votes(state, x)).toBe(1);
      expect(votes(state, y)).toBe(0);
      // `selected` is the Player's; the server never stored the set.
      expect(state.sourceValues.source_selected ?? null).toBeNull();
      const [row] = await db.select().from(playerEvents).where(eq(playerEvents.runId, run.id));
      expect(row).toMatchObject({ outcome: "accepted", resultingSceneId: "scene_green" });
    });

    it("applies every Show Update in order and advances stateSequence once", async () => {
      const { published, run, device } = await publishMultiActionCue(
        [
          adjust("action_first", "source_counter", [], 1),
          adjust("action_second", "source_counter", [], 2),
        ],
        true,
      );
      const before = await stateSequence();

      const result = await tapRed(device.pairingCode, published.version);

      expect(result).toMatchObject({ kind: "accepted" });
      expect((await readRunState(run.id, db)).sourceValues.source_counter).toBe(3);
      expect(await stateSequence()).toBe(before + 1);
      expect(
        await db.select().from(playerEvents).where(eq(playerEvents.runId, run.id)),
      ).toHaveLength(1);
    });

    it("commits none of the Cue's Show writes when a later one fails", async () => {
      const { published, run, device } = await publishMultiActionCue(
        [
          adjust("action_first", "source_counter", [], 1),
          // An array is not a number, so this one cannot plan.
          adjust("action_broken", "source_candidates", [], 1),
        ],
        true,
      );
      const counterBefore = (await readRunState(run.id, db)).sourceValues.source_counter;
      const before = await stateSequence();

      const result = await tapRed(device.pairingCode, published.version);

      expect(result).toMatchObject({
        kind: "failed",
        actionId: "action_broken",
        reason: "update-current-value-not-numeric",
      });
      expect((await readRunState(run.id, db)).sourceValues.source_counter).toBe(counterBefore);
      expect(await stateSequence()).toBe(before);
      const rows = await db.select().from(playerEvents).where(eq(playerEvents.runId, run.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ outcome: "failed", failingActionId: "action_broken" });
    });

    it("runs a Shared Device's Updates on both sides of its Navigate", async () => {
      const { published, run, device } = await publishMultiActionCue(
        [
          adjust("action_before", "source_counter", [], 1),
          {
            id: "action_go_green",
            cueId: MULTI_CUE_ID,
            kind: "navigate",
            targetSceneId: "scene_green",
          },
          adjust("action_after", "source_counter", [], 2),
        ],
        false,
      );
      const before = await stateSequence();

      const result = await tapRed(device.pairingCode, published.version);

      expect(result).toMatchObject({
        kind: "applied",
        resultingSceneId: "scene_green",
        changed: true,
      });
      expect((await readRunState(run.id, db)).sourceValues.source_counter).toBe(3);
      expect((await readRunDeviceState(run.id, device.id))?.activeSceneId).toBe("scene_green");
      expect(await stateSequence()).toBe(before + 1);
    });
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

  it("records ignored Events for a shared Device without a driver", async () => {
    await createShow();
    const device = await proofDevice();
    await writeShowGraph(showId, "draft", {
      nodes: [
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
      edges: [],
    });
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
