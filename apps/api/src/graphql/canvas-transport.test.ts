// The Canvas transport contract, end to end (#436, ADR-0014).
//
// Not a list of fields the query happens to select — that test passed while a
// Canvas six levels deep was being silently truncated. This one writes a
// Canvas, asks for it through the real query document against the real schema
// and resolvers, decodes it with the decoder Studio and Player share, and
// expects the Canvas that went in.
import { CANVAS_COMMAND_TYPES, type CanvasWorkspaceEdit } from "@mechane/commands";
import type { Element, FrameElement, ShowGraph } from "@mechane/domain";
import { generateId } from "@mechane/domain";
import { decodeCanvasDocument, GetShowCanvasesQuery } from "@mechane/graphql-schema";
import { eq } from "drizzle-orm";
import { print } from "graphql";
import { createYoga } from "graphql-yoga";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "../db/client";
import { readCanvasWorkspace } from "../db/canvas";
import { shows, user } from "../db/schema";
import { applyShowEdits, readShowGraph, writeShowGraph } from "../db/show-graph";
import type { GraphQLContext } from "./context";
import { schema } from "./schema";

const userId = `canvas-transport-${crypto.randomUUID()}`;
const showId = generateId("show");

const SCENE_GRAPH: ShowGraph = {
  nodes: [
    {
      id: "scene_one",
      kind: "scene",
      name: "Opening",
      position: { x: 0, y: 0 },
      parentId: null,
      variables: [],
    },
  ],
  edges: [],
};

async function query<T>(source: string, variables: Record<string, unknown>): Promise<T> {
  const context: GraphQLContext = { userId, user: { id: userId } as GraphQLContext["user"] };
  const yoga = createYoga<GraphQLContext>({
    schema,
    context: () => context,
    graphqlEndpoint: "/api/graphql",
    // A masked "Unexpected error." would tell a failing test nothing.
    maskedErrors: false,
  });
  const response = await yoga.fetch("http://localhost/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: source, variables }),
  });
  const result = (await response.json()) as { data?: T; errors?: { message: string }[] };
  expect(result.errors).toBeUndefined();
  if (!result.data) throw new Error("GraphQL response did not contain data.");
  return result.data;
}

/** The edits that build one chain of Frames `depth` deep, with a Text leaf. */
function deepCanvasEdits(canvasId: string, rootId: string, depth: number): CanvasWorkspaceEdit[] {
  const edits: CanvasWorkspaceEdit[] = [];
  let parentId = rootId;
  for (let level = 0; level < depth; level += 1) {
    const id = `frame_${level}`;
    edits.push({
      canvasId,
      edit: {
        type: CANVAS_COMMAND_TYPES.addElement,
        element: { id, type: "frame", name: `Level ${level}` },
        parentId,
        rank: "a0",
      },
    });
    parentId = id;
  }
  edits.push({
    canvasId,
    edit: {
      type: CANVAS_COMMAND_TYPES.addElement,
      element: { id: "leaf", type: "text", content: "Deep", textAlign: "center" },
      parentId,
      rank: "a0",
    },
  });
  return edits;
}

describe("Canvas GraphQL transport", () => {
  beforeEach(async () => {
    await db.insert(user).values({
      id: userId,
      name: "Canvas Transport Test",
      email: `${userId}@example.com`,
      emailVerified: true,
    });
    await db.insert(shows).values({ id: showId, name: "Canvas Transport Test", userId });
    await writeShowGraph(showId, "draft", SCENE_GRAPH);
  });

  afterEach(async () => {
    await db.delete(user).where(eq(user.id, userId));
  });

  it("delivers a Canvas deeper than any recursive selection could have reached", async () => {
    const [artboard] = (await readCanvasWorkspace(showId, "draft")).canvases;
    if (!artboard) throw new Error("The Scene Canvas was not created.");
    const draft = await readShowGraph(showId, "draft");
    // Twenty levels: well past the five the old nested selection could see.
    await applyShowEdits(
      showId,
      [],
      deepCanvasEdits(artboard.id, artboard.root.id, 20),
      draft.version,
    );

    const data = await query<{ showCanvases: unknown[] }>(print(GetShowCanvasesQuery), {
      showId,
      state: "draft",
    });
    const document = data.showCanvases[0] as { canvas: unknown };
    const canvas = decodeCanvasDocument(document.canvas);

    let node: Element = canvas.root;
    for (let level = 0; level < 20; level += 1) {
      const child: Element | undefined = node.children?.[0];
      if (!child) throw new Error(`Canvas was truncated at level ${level}.`);
      expect(child.id).toBe(`frame_${level}`);
      node = child;
    }
    expect(node.children?.[0]).toMatchObject({
      id: "leaf",
      type: "text",
      content: "Deep",
      textAlign: "center",
    });
  });

  it("carries the Artboard's framing beside the Canvas it presents", async () => {
    const data = await query<{
      showCanvases: {
        ownerId: string;
        ownerName: string;
        position: { x: number; y: number };
        canvas: { id: string; kind: string };
      }[];
    }>(print(GetShowCanvasesQuery), { showId, state: "draft" });

    const [artboard] = data.showCanvases;
    if (!artboard) throw new Error("The Scene Canvas was not delivered.");
    expect(artboard.ownerId).toBe("scene_one");
    expect(artboard.ownerName).toBe("Opening");
    expect(artboard.position).toEqual({ x: expect.any(Number), y: expect.any(Number) });
    expect(artboard.canvas.kind).toBe("scene");
  });

  it("preserves every Property an Element carries, at every depth", async () => {
    const [artboard] = (await readCanvasWorkspace(showId, "draft")).canvases;
    if (!artboard) throw new Error("The Scene Canvas was not created.");
    const draft = await readShowGraph(showId, "draft");
    await applyShowEdits(
      showId,
      [],
      [
        {
          canvasId: artboard.id,
          edit: {
            type: CANVAS_COMMAND_TYPES.addElement,
            element: { id: "group", type: "frame", layoutMode: "auto", gap: 8, clip: true },
            parentId: artboard.root.id,
            rank: "a0",
          },
        },
        {
          canvasId: artboard.id,
          edit: {
            type: CANVAS_COMMAND_TYPES.addElement,
            element: {
              id: "title",
              type: "text",
              content: "Hello",
              textAlign: "center",
              textVerticalAlign: "bottom",
              fontSize: 32,
              alignSelf: "end",
              layout: { aspectRatio: { ratio: 2, driver: "width" } },
            },
            parentId: "group",
            rank: "a0",
          },
        },
      ],
      draft.version,
    );

    const data = await query<{ showCanvases: { canvas: unknown }[] }>(print(GetShowCanvasesQuery), {
      showId,
      state: "draft",
    });
    const canvas = decodeCanvasDocument(data.showCanvases[0]!.canvas);
    const group = canvas.root.children?.[0] as FrameElement;
    expect(group).toMatchObject({ id: "group", layoutMode: "auto", gap: 8, clip: true });
    expect(group.children?.[0]).toMatchObject({
      id: "title",
      type: "text",
      content: "Hello",
      textAlign: "center",
      textVerticalAlign: "bottom",
      fontSize: 32,
      alignSelf: "end",
      layout: { aspectRatio: { ratio: 2, driver: "width" } },
    });
  });

  it("orders siblings by rank, whatever order the rows come back in", async () => {
    const [artboard] = (await readCanvasWorkspace(showId, "draft")).canvases;
    if (!artboard) throw new Error("The Scene Canvas was not created.");
    const draft = await readShowGraph(showId, "draft");
    await applyShowEdits(
      showId,
      [],
      ["a2", "a0", "a1"].map((rank, index) => ({
        canvasId: artboard.id,
        edit: {
          type: CANVAS_COMMAND_TYPES.addElement as typeof CANVAS_COMMAND_TYPES.addElement,
          element: { id: `rect_${index}`, type: "rect" as const },
          parentId: artboard.root.id,
          rank,
        },
      })),
      draft.version,
    );

    const data = await query<{ showCanvases: { canvas: unknown }[] }>(print(GetShowCanvasesQuery), {
      showId,
      state: "draft",
    });
    const canvas = decodeCanvasDocument(data.showCanvases[0]!.canvas);
    expect(canvas.root.children?.map((child) => child.id)).toEqual(["rect_1", "rect_2", "rect_0"]);
  });
});
