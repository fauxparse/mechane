import { describe, expect, it } from "vitest";

import { assertValidShapes, type Shape } from "./shapes";
import { defaultValueForType, defaultSourceValues, sourceDefaultsFor } from "./source-defaults";

const graph = {
  shapes: [
    {
      id: "shape_vote",
      name: "Vote",
      fields: [
        {
          id: "field_count",
          name: "Count",
          type: "number" as const,
          required: true,
          defaultValue: 12,
        },
        {
          id: "field_label",
          name: "Label",
          type: "text" as const,
          required: false,
          defaultValue: null,
        },
      ],
    },
  ],
  sourceFieldDefaults: [
    { nodeId: "source_votes", fieldPath: ["field_count"], value: 3 },
    { nodeId: "source_votes", fieldPath: ["field_label"], value: "votes" },
  ],
  nodes: [
    {
      id: "source_votes",
      kind: "source" as const,
      name: "Votes",
      parentId: null,
      position: { x: 0, y: 0 },
      type: { kind: "shape" as const, shapeId: "shape_vote" },
    },
    {
      id: "source_count",
      kind: "source" as const,
      name: "Count",
      parentId: null,
      position: { x: 0, y: 0 },
      type: "number" as const,
    },
  ],
  edges: [],
};

describe("defaultSourceValues", () => {
  it("returns only the requested Source's graph-owned defaults", () => {
    expect(sourceDefaultsFor(graph, "source_votes")).toEqual([
      { nodeId: "source_votes", fieldPath: ["field_count"], value: 3 },
      { nodeId: "source_votes", fieldPath: ["field_label"], value: "votes" },
    ]);
    expect(sourceDefaultsFor(graph, "source_count")).toEqual([]);
  });
  it("materialises Shape defaults and sparse Source overrides", () => {
    expect(defaultSourceValues(graph)).toEqual({
      source_votes: { field_count: 3, field_label: "votes" },
      source_count: 0,
    });
  });
});

describe("image defaults", () => {
  const posterReference = { assetId: "asset_poster", revision: "2" };
  const candidateShape = (imageDefault: unknown): Shape => ({
    id: "shape_candidate",
    name: "Candidate",
    fields: [
      {
        id: "field_image",
        name: "image",
        type: "image",
        required: false,
        defaultValue: imageDefault,
      },
    ],
  });
  const imageGraph = {
    shapes: [candidateShape(null)],
    sourceFieldDefaults: [],
    nodes: [
      {
        id: "source_portrait",
        kind: "source" as const,
        name: "Portrait",
        parentId: null,
        position: { x: 0, y: 0 },
        type: "image" as const,
      },
      {
        id: "source_candidate",
        kind: "source" as const,
        name: "Candidate",
        parentId: null,
        position: { x: 0, y: 0 },
        type: { kind: "shape" as const, shapeId: "shape_candidate" },
      },
    ],
    edges: [],
  };

  it("defaults an unselected image to typed absence, not empty text", () => {
    expect(defaultValueForType("image")).toBe(null);
    expect(defaultSourceValues(imageGraph)).toEqual({
      source_portrait: null,
      source_candidate: { field_image: null },
    });
  });

  it("keeps a Shape definition valid when its Fields default to typed absence", () => {
    const shapes = [candidateShape(null)];
    const withGeneratedDefaults = shapes.map((shape) => ({
      ...shape,
      fields: shape.fields.map((field) => ({
        ...field,
        defaultValue: defaultValueForType(field.type, shapes),
      })),
    }));
    expect(withGeneratedDefaults[0]!.fields[0]!.defaultValue).toBe(null);
    expect(() => assertValidShapes(withGeneratedDefaults)).not.toThrow();
  });

  it("retains authored image asset references as Shape Field defaults", () => {
    const shapes = [candidateShape(posterReference)];
    expect(() => assertValidShapes(shapes)).not.toThrow();
    expect(defaultValueForType({ kind: "shape", shapeId: "shape_candidate" }, shapes)).toEqual({
      field_image: posterReference,
    });
  });

  it("still rejects empty text as an image Field default", () => {
    expect(() => assertValidShapes([candidateShape("")])).toThrow(/does not conform to image/);
  });
});
