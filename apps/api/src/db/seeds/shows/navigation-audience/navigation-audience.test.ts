import { assertValidShowGraph } from "@mechane/domain";
import { describe, expect, it } from "vitest";

import { readPlayerSession } from "../../../../player";
import { readShowGraph, publishShowGraph } from "../../../show-graph";
import { startRun } from "../../../runs";
import { setupPostgresTest } from "../../../test-helpers";
import {
  navigationAudienceGraph,
  NAVIGATION_AUDIENCE_DEVICE_ID,
  seedShow,
} from "./navigation-audience";

const { showId, createShow } = setupPostgresTest("navigation-audience-test");

describe("Navigation Audience seed", () => {
  it("copies the Navigation Proof topology with one per-connection Device", () => {
    const graph = navigationAudienceGraph();
    expect(() => assertValidShowGraph(graph)).not.toThrow();
    expect(graph.nodes.filter((node) => node.kind === "scene")).toHaveLength(3);
    expect(graph.nodes.filter((node) => node.kind === "device")).toEqual([
      expect.objectContaining({ id: NAVIGATION_AUDIENCE_DEVICE_ID, perConnection: true }),
    ]);
    expect(graph.cues).toHaveLength(6);
    expect(graph.actions).toHaveLength(6);
    expect(graph.eventBindings).toHaveLength(12);
    expect(graph.edges.filter((edge) => edge.kind === "navigate")).toHaveLength(6);
    expect(graph.edges.filter((edge) => edge.kind === "device")).toEqual([
      expect.objectContaining({
        sourceId: "flow_navigation",
        targetId: NAVIGATION_AUDIENCE_DEVICE_ID,
      }),
    ]);
  });

  it("persists the Audience Device and its complete Flow bundle", async () => {
    await createShow("Navigation Audience Test");
    await seedShow.seed(showId);
    await publishShowGraph(showId);
    await startRun(showId);

    const published = await readShowGraph(showId, "published");
    const device = published.nodes.find((node) => node.id === NAVIGATION_AUDIENCE_DEVICE_ID);
    if (device?.kind !== "device" || !device.pairingCode) {
      throw new Error("Navigation Audience pairing code was not minted.");
    }
    const session = await readPlayerSession(device.pairingCode);
    expect(session?.device.perConnection).toBe(true);
    expect(session?.scene).toBeNull();
    expect(session?.canvas).toBeNull();
    expect(session?.flow?.flowId).toBe("flow_navigation");
    expect(session?.flow?.scenes.map(({ scene }) => scene.id).sort()).toEqual([
      "scene_blue",
      "scene_green",
      "scene_red",
    ]);
  });
});
