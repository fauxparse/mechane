import type { GraphEdit } from "@mechane/commands";
import type { ShowGraph } from "@mechane/domain";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "./client";
import { shows, user } from "./schema";
import { applyShowEdits, readShowGraph, writeShowGraph } from "./show-graph";

const userId = `shape-value-test-${crypto.randomUUID()}`;
const showId = `shape-value-show-${crypto.randomUUID()}`;

const graph: ShowGraph = {
  shapes: [
    {
      id: "shape_profile",
      name: "Profile",
      fields: [
        {
          id: "headline",
          name: "Headline",
          type: "text",
          required: true,
          defaultValue: "Before",
        },
      ],
    },
  ],
  nodes: [
    {
      id: "source_profile",
      kind: "source",
      name: "Profile",
      position: { x: 0, y: 0 },
      parentId: null,
      type: { kind: "shape", shapeId: "shape_profile" },
      fieldDefaults: [{ nodeId: "source_profile", fieldPath: ["headline"], value: "Before" }],
    },
  ],
  edges: [],
  sourceFieldDefaults: [{ nodeId: "source_profile", fieldPath: ["headline"], value: "Before" }],
};

afterEach(async () => {
  await db.delete(user).where(eq(user.id, userId));
});

describe("shape source value persistence", () => {
  it("keeps a field value after the draft is reread", async () => {
    await db.insert(user).values({
      id: userId,
      name: "Shape Value Test",
      email: `${userId}@example.com`,
      emailVerified: true,
    });
    await db.insert(shows).values({ id: showId, name: "Shape Value Test", userId });
    await writeShowGraph(showId, "draft", graph);

    const draft = await readShowGraph(showId, "draft");
    const edit: GraphEdit = {
      type: "graph.setSourceFieldDefault",
      nodeId: "source_profile",
      fieldPath: ["headline"],
      value: "After",
    };
    await applyShowEdits(showId, [edit], [], draft.version);

    const reread = await readShowGraph(showId, "draft");
    expect(reread.sourceFieldDefaults).toEqual([
      { nodeId: "source_profile", fieldPath: ["headline"], value: "After" },
    ]);
  });
});
