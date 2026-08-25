import { describe, expect, it } from "vitest";

import { deriveShowGraphFacts } from "./graph-facts";
import type { ShowGraph } from "./graph";

const graph: ShowGraph = {
  nodes: [
    {
      id: "flow_1",
      kind: "flow",
      name: "Voting",
      position: { x: 0, y: 0 },
      parentId: null,
      color: "purple",
      defaultSceneId: "scene_1",
    },
    {
      id: "scene_1",
      kind: "scene",
      name: "Vote",
      position: { x: 24, y: 74 },
      parentId: "flow_1",
      variables: [
        { id: "variable_text", name: "Text", type: "text" },
        { id: "variable_number", name: "Number", type: "number" },
      ],
    },
    {
      id: "source_1",
      kind: "source",
      name: "Score",
      position: { x: 0, y: 0 },
      parentId: "flow_1",
      type: "number",
    },
    {
      id: "device_1",
      kind: "device",
      name: "Projector",
      position: { x: 0, y: 0 },
      parentId: null,
      perConnection: false,
      pairingCode: null,
    },
  ],
  edges: [
    {
      id: "wire_text",
      kind: "wiring",
      sourceId: "source_1",
      targetId: "scene_1",
      sourcePath: [],
      targetPath: ["variable_text"],
    },
    {
      id: "wire_number",
      kind: "wiring",
      sourceId: "source_1",
      targetId: "scene_1",
      sourcePath: [],
      targetPath: ["variable_number"],
    },
    {
      id: "drive_device",
      kind: "device",
      sourceId: "flow_1",
      targetId: "device_1",
      sourcePath: [],
      targetPath: [],
    },
  ],
};

describe("deriveShowGraphFacts", () => {
  it("derives inherited colors, wired Variables, entry Scenes, and driven Devices", () => {
    const facts = deriveShowGraphFacts(graph);

    expect(facts.nodes.get("flow_1")).toMatchObject({ color: "purple" });
    expect(facts.nodes.get("scene_1")).toMatchObject({
      color: "purple",
      wiredVariableIds: ["variable_text", "variable_number"],
      isDefaultScene: true,
    });
    expect(facts.nodes.get("source_1")?.color).toBe("purple");
    expect(facts.nodes.get("device_1")?.driven).toBe(true);
  });

  it("derives compatibility and coercion status from edge endpoint types", () => {
    const facts = deriveShowGraphFacts(graph);

    expect(facts.edges.get("wire_text")).toMatchObject({
      targetVariableId: "variable_text",
      sourceType: "number",
      targetType: "text",
      typeCompatibility: "coercing",
      color: "purple",
    });
    expect(facts.edges.get("wire_number")).toMatchObject({
      sourceType: "number",
      targetType: "number",
      typeCompatibility: "compatible",
    });
  });

  it("marks unsupported endpoint types as incompatible", () => {
    const incompatible: ShowGraph = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === "scene_1" && node.kind === "scene"
          ? {
              ...node,
              variables: node.variables.map((variable) =>
                variable.id === "variable_number" ? { ...variable, type: "boolean" } : variable,
              ),
            }
          : node,
      ),
    };

    expect(deriveShowGraphFacts(incompatible).edges.get("wire_number")?.typeCompatibility).toBe(
      "incompatible",
    );
  });
});
