import {
  defaultSourceValueTemplates,
  materializeRunState,
  resolveRuntimeValue,
  type ShowGraph,
} from "@mechane/domain";
import { describe, expect, it } from "vitest";

import { runStateForEditedSources } from "./runs";

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
          defaultValue: "Draft headline",
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
    {
      id: "source_other",
      kind: "source",
      name: "Other",
      position: { x: 0, y: 0 },
      parentId: null,
      type: "text",
    },
  ],
  edges: [],
  sourceFieldDefaults: [
    { nodeId: "source_profile", fieldPath: ["headline"], value: "Edited headline" },
  ],
};

describe("runStateForEditedSources", () => {
  it("updates edited sources while leaving other live values untouched", () => {
    const current = materializeRunState(graph, defaultSourceValueTemplates(graph));
    current.sourceValues.source_other = "Keep this live value";
    const next = runStateForEditedSources(current, graph, new Set(["source_profile"]));

    expect(resolveRuntimeValue(next.sourceValues.source_profile!, next.structuredValues)).toEqual({
      headline: "Edited headline",
    });
    expect(next.sourceValues.source_other).toBe("Keep this live value");
  });
});
