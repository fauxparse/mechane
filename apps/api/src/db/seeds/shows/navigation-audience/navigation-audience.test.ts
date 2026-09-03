import { assertValidShowGraph } from "@mechane/domain";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "../../../client";
import { readPlayerSession } from "../../../../player";
import { readShowGraph, publishShowGraph } from "../../../show-graph";
import { startRun } from "../../../runs";
import { shows, user } from "../../../schema";
import {
  navigationAudienceGraph,
  NAVIGATION_AUDIENCE_DEVICE_ID,
  seedShow,
} from "./navigation-audience";

const userId = `navigation-audience-test-${crypto.randomUUID()}`;
const showId = `navigation-audience-show-${crypto.randomUUID()}`;

afterEach(async () => {
  await db.delete(user).where(eq(user.id, userId));
});

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
    await db.insert(user).values({
      id: userId,
      name: "Navigation Audience Test",
      email: `${userId}@example.com`,
      emailVerified: true,
    });
    await db.insert(shows).values({ id: showId, name: "Navigation Audience", userId });
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
