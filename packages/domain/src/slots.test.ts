import { describe, expect, it } from "vitest";
import type { SlotElement } from "./canvas";
import { emptyBlock } from "./blocks";
import { resolveBlockCanvas, resolveSlotInputs, expandSlotSource } from "./slots";

describe("Slot input resolution", () => {
  it("resolves literal assignments and defaults", () => {
    const block = {
      ...emptyBlock("Card"),
      variables: [
        { id: "title", name: "Title", type: "text" as const, required: true },
        { id: "count", name: "Count", type: "number" as const, required: false, defaultValue: 2 },
      ],
    };
    const slot = {
      id: "slot",
      type: "slot" as const,
      blockId: block.id,
      assignments: [{ variableId: "title", source: { kind: "literal" as const, value: "Hello" } }],
    };
    expect(resolveSlotInputs(block, slot).values).toEqual({ title: "Hello", count: 2 });
  });

  it("reports missing required input and expands arrays in source order", () => {
    const block = {
      ...emptyBlock("Card"),
      variables: [{ id: "title", name: "Title", type: "text" as const, required: true }],
    };
    const slot = { id: "slot", type: "slot" as const, blockId: block.id };
    expect(resolveSlotInputs(block, slot).diagnostics[0]?.category).toBe("missingRequiredInput");
    expect(expandSlotSource(["a", "b"]).items).toEqual(["a", "b"]);
    expect(expandSlotSource("a").items).toEqual(["a"]);
  });

  it("resolves shaped paths by stable field id after a field rename", () => {
    const block = {
      ...emptyBlock("Card"),
      variables: [{ id: "title", name: "Title", type: "text" as const, required: true }],
    };
    const source = {
      id: "person",
      type: { kind: "shape" as const, shapeId: "person" },
      value: { name: "Ada" },
    };
    const slot: SlotElement = {
      id: "slot",
      type: "slot",
      blockId: block.id,
      assignments: [
        {
          variableId: "title",
          source: { kind: "variable", variableId: source.id, fieldPath: ["name"] },
        },
      ],
    };
    const shapes = [
      {
        id: "person",
        name: "Person",
        fields: [
          {
            id: "name",
            name: "Display name",
            type: "text" as const,
            required: true,
            defaultValue: "",
          },
        ],
      },
    ];
    expect(resolveSlotInputs(block, slot, [source], undefined, undefined, shapes).values).toEqual({
      title: "Ada",
    });
    shapes[0]!.fields[0]!.name = "Renamed";
    expect(resolveSlotInputs(block, slot, [source], undefined, undefined, shapes).values).toEqual({
      title: "Ada",
    });
  });

  it("reports duplicate assignments and coerces literal arrays from their item type", () => {
    const block = {
      ...emptyBlock("Card"),
      variables: [
        {
          id: "labels",
          name: "Labels",
          type: { kind: "array" as const, of: "text" as const },
          required: false,
        },
      ],
    };
    const slot: SlotElement = {
      id: "slot",
      type: "slot",
      blockId: block.id,
      assignments: [
        { variableId: "labels", source: { kind: "literal", value: [1] } },
        { variableId: "labels", source: { kind: "literal", value: ["ignored"] } },
      ],
    };
    const resolution = resolveSlotInputs(block, slot);
    expect(resolution.values).toEqual({ labels: ["1"] });
    expect(resolution.diagnostics[0]?.category).toBe("invalidAssignment");
  });

  it("materializes Block Canvas connections from resolved Slot values", () => {
    const block = {
      ...emptyBlock("Card"),
      canvas: {
        ...emptyBlock("Card").canvas,
        root: {
          id: "root",
          type: "frame" as const,
          children: [
            {
              id: "title",
              type: "text" as const,
              content: { kind: "variable" as const, variableId: "title" },
            },
          ],
        },
      },
      variables: [{ id: "title", name: "Title", type: "text" as const, required: true }],
    };
    const resolved = resolveBlockCanvas(block, { title: "Live" });
    expect(resolved.root.children?.[0]).toMatchObject({ id: "title", content: "Live" });
  });
});
