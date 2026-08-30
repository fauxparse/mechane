import { ARTBOARD_COMMAND_TYPES, type CanvasWorkspaceEdit } from "@mechane/commands";
import type { ShowGraph } from "@mechane/domain";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "./client";
import { latestCanvasFills, readCanvasWorkspace } from "./canvas";
import { shows, user } from "./schema";
import { applyShowEdits, readShowGraph, writeShowGraph } from "./show-graph";

const userId = `scene-canvas-test-${crypto.randomUUID()}`;
const showId = `scene-canvas-show-${crypto.randomUUID()}`;

function graphWithScenes(...scenes: { id: string; name: string; x: number }[]): ShowGraph {
  return {
    nodes: scenes.map((scene) => ({
      id: scene.id,
      kind: "scene" as const,
      name: scene.name,
      position: { x: scene.x, y: 0 },
      parentId: null,
      variables: [],
    })),
    edges: [],
  };
}

describe("latestCanvasFills", () => {
  it("inherits the newest valid root fill independently for Scenes and Blocks", () => {
    const fills = latestCanvasFills(
      [
        { id: "scene_old", sceneNodeId: "scene_old", createdAt: new Date("2026-01-01") },
        { id: "block_new", sceneNodeId: null, createdAt: new Date("2026-01-02") },
        { id: "scene_new", sceneNodeId: "scene_new", createdAt: new Date("2026-01-03") },
      ],
      [
        {
          canvasId: "scene_old",
          parentId: null,
          properties: { fill: "#111111" },
        },
        {
          canvasId: "block_new",
          parentId: null,
          properties: { fill: "#222222" },
        },
        {
          canvasId: "scene_new",
          parentId: null,
          properties: { fill: "#333333" },
        },
      ],
    );

    expect(fills).toEqual({ scene: "#333333", block: "#222222" });
  });

  it("ignores nested, malformed, and empty fills", () => {
    expect(
      latestCanvasFills(
        [{ id: "scene", sceneNodeId: "scene", createdAt: new Date() }],
        [
          { canvasId: "scene", parentId: "child", properties: { fill: "#111111" } },
          { canvasId: "scene", parentId: null, properties: { fill: "" } },
        ],
      ),
    ).toEqual({ scene: undefined, block: undefined });
  });
});

describe("Scene Canvas reconciliation", () => {
  afterEach(async () => {
    await db.delete(user).where(eq(user.id, userId));
  });
  it("preserves an existing Canvas tree, adds new Scenes, and removes deleted Scenes", async () => {
    await db.insert(user).values({
      id: userId,
      name: "Scene Canvas Test",
      email: `${userId}@example.com`,
      emailVerified: true,
    });
    await db.insert(shows).values({ id: showId, name: "Scene Canvas Test", userId });

    await writeShowGraph(showId, "draft", graphWithScenes({ id: "scene_one", name: "One", x: 0 }));
    const initial = (await readCanvasWorkspace(showId, "draft")).canvases;
    expect(initial).toHaveLength(1);
    const original = initial[0];
    if (!original) throw new Error("Initial Scene Canvas was not created.");
    const canvasEdit: CanvasWorkspaceEdit = {
      canvasId: original.id,
      edit: { type: ARTBOARD_COMMAND_TYPES.move, position: { x: 120, y: 40 } },
    };
    const draft = await readShowGraph(showId, "draft");
    const applied = await applyShowEdits(showId, [], [canvasEdit], draft.version);
    expect(applied.canvas?.position).toEqual({ x: 120, y: 40 });

    await writeShowGraph(
      showId,
      "draft",
      graphWithScenes(
        { id: "scene_one", name: "Renamed", x: 0 },
        { id: "scene_two", name: "Two", x: 800 },
      ),
    );
    const withNewScene = (await readCanvasWorkspace(showId, "draft")).canvases;
    expect(withNewScene).toHaveLength(2);
    expect(withNewScene.find((canvas) => canvas.ownerId === "scene_one")).toMatchObject({
      id: original.id,
      root: { id: original.root.id },
    });
    expect(withNewScene.find((canvas) => canvas.ownerId === "scene_two")).toMatchObject({
      position: { x: 880, y: 40 },
    });
    await writeShowGraph(
      showId,
      "draft",
      graphWithScenes({ id: "scene_two", name: "Two", x: 800 }),
    );
    const afterRemoval = (await readCanvasWorkspace(showId, "draft")).canvases;
    expect(afterRemoval.map((canvas) => canvas.ownerId)).toEqual(["scene_two"]);
  });
});
