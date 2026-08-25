import { commandForEdit, composite } from "@mechane/commands";
import {
  defaultSourceValues,
  planConnection,
  type ShowGraph,
  type SourceNode,
} from "@mechane/domain";
import { describe, expect, it } from "vitest";

const graph: ShowGraph = {
  shapes: [
    {
      id: "profile",
      name: "Profile",
      fields: [
        { id: "headline", name: "Headline", type: "text", required: true, defaultValue: "" },
      ],
    },
  ],
  nodes: [
    {
      id: "source_upstream",
      kind: "source",
      name: "Upstream",
      position: { x: 0, y: 0 },
      parentId: null,
      type: { kind: "shape", shapeId: "profile" },
    },
  ],
  edges: [],
  sourceFieldDefaults: [{ nodeId: "source_upstream", fieldPath: ["headline"], value: "Current" }],
};

describe("created source value propagation", () => {
  it("persists the dragged field value through the editor command batch", () => {
    const created: SourceNode = {
      id: "source_created",
      kind: "source",
      name: "Headline",
      position: { x: 300, y: 0 },
      parentId: null,
      type: "text",
    };
    const plan = planConnection(
      graph,
      { sourceId: "source_upstream", sourceHandle: "headline", targetId: created.id },
      { edgeId: "edge_created", variableId: "unused" },
      { addNode: created },
    );
    if ("error" in plan) throw new Error(plan.error);

    const applied = composite({
      label: "Create Source",
      commands: plan.edits.map((edit) => commandForEdit(edit)),
    }).apply(graph).state;
    expect(defaultSourceValues(applied)[created.id]).toBe("Current");
  });
});
