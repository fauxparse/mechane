import type { ShowGraph } from "@mechane/domain";
import { describe, expect, it } from "vitest";

import { sourceValuesForEditedSources } from "./runs";

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

describe("sourceValuesForEditedSources", () => {
  it("updates edited sources while leaving other live values untouched", () => {
    expect(
      sourceValuesForEditedSources(
        {
          source_profile: { headline: "Old live value" },
          source_other: "Keep this live value",
        },
        graph,
        new Set(["source_profile"]),
      ),
    ).toEqual({
      source_profile: { headline: "Edited headline" },
      source_other: "Keep this live value",
    });
  });
});
