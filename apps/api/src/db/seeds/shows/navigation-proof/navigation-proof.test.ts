import { assertValidCanvas, assertValidShowGraph } from "@mechane/domain";
import type { GraphEdit } from "@mechane/commands";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "../../../client";
import {
  applyShowEdits,
  readShowGraph,
  publishShowGraph,
  writeShowGraph,
} from "../../../show-graph";
import { startRun } from "../../../runs";
import { shows, user } from "../../../schema";
import { readPlayerSession } from "../../../../player";

import {
  navigationProofCanvases,
  navigationProofGraph,
  NAVIGATION_AUDIENCE_DEVICE_ID,
  NAVIGATION_DEVICE_ID,
  NAVIGATION_FLOW_ID,
  NAVIGATION_SCENE_IDS,
  seedShow,
} from "./navigation-proof";
const userId = `navigation-proof-test-${crypto.randomUUID()}`;
const showId = `navigation-proof-show-${crypto.randomUUID()}`;

afterEach(async () => {
  await db.delete(user).where(eq(user.id, userId));
});

describe("Navigation Proof seed", () => {
  it("builds a complete three-scene interaction graph", () => {
    const graph = navigationProofGraph();
    expect(() => assertValidShowGraph(graph)).not.toThrow();

    const scenes = graph.nodes.filter((node) => node.kind === "scene");
    expect(scenes).toHaveLength(3);
    expect(scenes.map((scene) => scene.name)).toEqual(["Red", "Green", "Blue"]);
    expect(scenes.map((scene) => scene.color)).toEqual(["red", "green", "blue"]);
    expect(scenes.map((scene) => scene.position)).toEqual([
      { x: 240, y: 120 },
      { x: 1040, y: 120 },
      { x: 640, y: 813 },
    ]);
    expect(graph.nodes.find((node) => node.id === NAVIGATION_FLOW_ID)).toMatchObject({
      position: { x: 0, y: 0 },
    });
    expect(graph.nodes.find((node) => node.id === NAVIGATION_DEVICE_ID)).toMatchObject({
      position: { x: 1840, y: 466 },
    });
    expect(graph.nodes.find((node) => node.id === NAVIGATION_FLOW_ID)).toMatchObject({
      kind: "flow",
      defaultSceneId: "scene_red",
    });
    expect(graph.nodes.find((node) => node.id === NAVIGATION_DEVICE_ID)).toMatchObject({
      kind: "device",
      perConnection: false,
    });
    expect(graph.nodes.find((node) => node.id === NAVIGATION_AUDIENCE_DEVICE_ID)).toMatchObject({
      kind: "device",
      perConnection: true,
    });
    expect(graph.nodes.filter((node) => node.kind === "device")).toHaveLength(2);

    expect(graph.cues).toHaveLength(6);
    expect(graph.actions).toHaveLength(6);
    // Six taps plus six keypresses: each Scene binds the first letter of both
    // destinations to the same Cue its buttons use.
    expect(graph.eventBindings).toHaveLength(12);
    const shortcuts = (graph.eventBindings ?? []).filter((b) => b.eventKind === "keypress");
    expect(shortcuts).toHaveLength(6);
    expect(shortcuts.every((b) => b.elementId.endsWith("_root"))).toBe(true);
    expect(new Set(shortcuts.map((b) => b.eventKind === "keypress" && b.params.key))).toEqual(
      new Set(["r", "g", "b"]),
    );
    // No Scene binds its own letter — it owns no Cue that navigates to itself.
    expect(
      shortcuts.some(
        (b) =>
          b.eventKind === "keypress" && b.elementId.startsWith(`scene_${String(b.params.key)}`),
      ),
    ).toBe(false);
    expect(graph.edges.filter((edge) => edge.kind === "navigate")).toHaveLength(6);
    expect(
      graph.edges
        .filter((edge) => edge.kind === "navigate")
        .every((edge) => edge.cueId && edge.actionId),
    ).toBe(true);
  });

  it("builds a valid static canvas with two destination buttons per Scene", () => {
    const canvases = navigationProofCanvases();
    expect(Object.keys(canvases)).toEqual([...NAVIGATION_SCENE_IDS]);
    for (const canvas of Object.values(canvases))
      expect(() => assertValidCanvas(canvas)).not.toThrow();
    for (const sceneId of NAVIGATION_SCENE_IDS) {
      const children = canvases[sceneId]?.root.children ?? [];
      expect(children.filter((child) => child.type === "frame")).toHaveLength(2);
    }
    expect(canvases.scene_red?.root).toMatchObject({ fill: "#7f1d1d" });
    expect(canvases.scene_green?.root).toMatchObject({ fill: "#14532d" });
    expect(canvases.scene_blue?.root).toMatchObject({ fill: "#1e3a8a" });
  });
  it("persists the proof graph and starts the Shared Device at Red", async () => {
    await db.insert(user).values({
      id: userId,
      name: "Navigation Proof Test",
      email: `${userId}@example.com`,
      emailVerified: true,
    });
    await db.insert(shows).values({ id: showId, name: "Navigation Proof", userId });

    await seedShow.seed(showId);
    const published = await readShowGraph(showId, "published");
    const device = published.nodes.find((node) => node.id === NAVIGATION_DEVICE_ID);
    if (device?.kind !== "device" || !device.pairingCode) {
      throw new Error("Navigation Proof pairing code was not minted.");
    }
    expect(published.cues).toHaveLength(6);
    await startRun(showId);
    const session = await readPlayerSession(device.pairingCode);
    expect(session?.scene?.id).toBe("scene_red");
    expect(session?.graph.cues).toHaveLength(6);
    expect(session?.graph.actions).toHaveLength(6);
    expect(session?.graph.eventBindings).toHaveLength(12);
    const audience = published.nodes.find((node) => node.id === NAVIGATION_AUDIENCE_DEVICE_ID);
    if (audience?.kind !== "device" || !audience.pairingCode) {
      throw new Error("Navigation Proof Audience pairing code was not minted.");
    }
    const audienceSession = await readPlayerSession(audience.pairingCode);
    expect(audienceSession?.scene).toBeNull();
    expect(audienceSession?.canvas).toBeNull();
    expect(audienceSession?.flow?.scenes.map(({ scene }) => scene.id).sort()).toEqual([
      "scene_blue",
      "scene_green",
      "scene_red",
    ]);
  });
  it("preserves interactions when a live Source default is edited", async () => {
    await db.insert(user).values({
      id: userId,
      name: "Navigation Proof Test",
      email: `${userId}@example.com`,
      emailVerified: true,
    });
    await db.insert(shows).values({ id: showId, name: "Navigation Proof", userId });
    await seedShow.seed(showId);

    const draft = await readShowGraph(showId, "draft");
    await writeShowGraph(showId, "draft", {
      ...draft,
      nodes: [
        ...draft.nodes,
        {
          id: "source_counter",
          kind: "source",
          name: "Counter",
          position: { x: 0, y: 0 },
          parentId: null,
          type: "number",
        },
      ],
      sourceFieldDefaults: [
        ...(draft.sourceFieldDefaults ?? []),
        { nodeId: "source_counter", fieldPath: [], value: 0 },
      ],
    });
    await publishShowGraph(showId);
    await startRun(showId);

    const beforeEdit = await readShowGraph(showId, "draft");
    const edit: GraphEdit = {
      type: "graph.setSourceFieldDefault",
      nodeId: "source_counter",
      fieldPath: [],
      value: 1,
    };
    await applyShowEdits(showId, [edit], [], beforeEdit.version);

    const published = await readShowGraph(showId, "published");
    expect(published.cues).toHaveLength(6);
    expect(published.actions).toHaveLength(6);
    expect(published.eventBindings).toHaveLength(12);
  });
});
