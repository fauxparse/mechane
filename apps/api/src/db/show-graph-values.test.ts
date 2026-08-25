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
  it("persists a Source created by a value-handle edit batch", async () => {
    await db.insert(user).values({
      id: userId,
      name: "Shape Value Test",
      email: `${userId}@example.com`,
      emailVerified: true,
    });
    await db.insert(shows).values({ id: showId, name: "Shape Value Test", userId });
    await writeShowGraph(showId, "draft", graph);

    const draft = await readShowGraph(showId, "draft");
    const created = {
      id: "source_created",
      kind: "source" as const,
      name: "Created",
      position: { x: 120, y: 0 },
      parentId: null,
      type: "text" as const,
    };
    await applyShowEdits(
      showId,
      [
        { type: "graph.addNode", node: created },
        {
          type: "graph.addEdge",
          edge: {
            id: "edge_created",
            kind: "wiring",
            sourceId: "source_profile",
            targetId: created.id,
            sourcePath: ["headline"],
            targetPath: [],
          },
        },
      ],
      [],
      draft.version,
    );

    const reread = await readShowGraph(showId, "draft");
    expect(reread.nodes).toContainEqual(created);
    expect(reread.edges).toContainEqual({
      id: "edge_created",
      kind: "wiring",
      sourceId: "source_profile",
      targetId: created.id,
      sourcePath: ["headline"],
      targetPath: [],
    });
    expect(reread.sourceFieldDefaults).not.toContainEqual({
      nodeId: created.id,
      fieldPath: [],
      value: "Copied",
    });
  });

  it("deletes a field-derived source without invalidating sibling wiring", async () => {
    await db.insert(user).values({
      id: userId,
      name: "Shape Value Test",
      email: `${userId}@example.com`,
      emailVerified: true,
    });
    await db.insert(shows).values({ id: showId, name: "Shape Value Test", userId });
    const sourceGraph: ShowGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: "scene_profile",
          kind: "scene",
          name: "Profile",
          position: { x: 100, y: 0 },
          parentId: null,
          variables: [
            {
              id: "variable_profile",
              name: "Profile",
              type: { kind: "shape", shapeId: "shape_profile" },
            },
          ],
        },
      ],
      edges: [
        {
          id: "edge_profile_scene",
          kind: "wiring",
          sourceId: "source_profile",
          targetId: "scene_profile",
          sourcePath: [],
          targetPath: ["variable_profile"],
        },
      ],
    };
    await writeShowGraph(showId, "draft", sourceGraph);

    const draft = await readShowGraph(showId, "draft");
    const child = {
      id: "source_headline",
      kind: "source" as const,
      name: "Headline",
      position: { x: 200, y: 0 },
      parentId: null,
      type: "text" as const,
    };
    const derivedEdge: GraphEdit = {
      type: "graph.addEdge",
      edge: {
        id: "edge_profile_headline",
        kind: "wiring",
        sourceId: "source_profile",
        targetId: child.id,
        sourcePath: ["headline"],
        targetPath: [],
      },
    };
    await applyShowEdits(
      showId,
      [{ type: "graph.addNode", node: child }, derivedEdge],
      [],
      draft.version,
    );

    const withChild = await readShowGraph(showId, "draft");
    await applyShowEdits(
      showId,
      [
        { type: "graph.removeEdge", edgeId: "edge_profile_headline" },
        { type: "graph.removeNode", nodeId: child.id },
      ],
      [],
      withChild.version,
    );

    const reread = await readShowGraph(showId, "draft");
    expect(reread.nodes.map((node) => node.id)).not.toContain(child.id);
    expect(reread.edges).toEqual([
      {
        id: "edge_profile_scene",
        kind: "wiring",
        sourceId: "source_profile",
        targetId: "scene_profile",
        sourcePath: [],
        targetPath: ["variable_profile"],
      },
    ]);
    expect(reread.shapes?.[0]?.fields).toHaveLength(1);
  });
});
