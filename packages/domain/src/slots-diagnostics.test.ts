import { describe, expect, it } from "vitest";
import type { SlotElement } from "./canvas";
import { emptyBlock } from "./blocks";
import { diagnoseSlot } from "./slots";

describe("Slot diagnostics", () => {
  it("reports missing references and invalid layout without dropping configuration", () => {
    const block = emptyBlock("Card");
    const missing = { id: "slot", type: "slot" as const, blockId: "missing" };
    expect(diagnoseSlot(missing, [block])[0]?.category).toBe("missingBlock");
    const invalid = {
      id: "slot",
      type: "slot" as const,
      blockId: block.id,
      layoutMode: "absolute" as const,
    };
    expect(diagnoseSlot(invalid, [block])[0]?.category).toBe("invalidSlotLayout");
  });

  it("reports invalid source paths and nested reference cycles", () => {
    const block = {
      ...emptyBlock("Card"),
      variables: [{ id: "title", name: "Title", type: "text" as const, required: true }],
    };
    const invalidSource: SlotElement = {
      id: "slot",
      type: "slot",
      blockId: block.id,
      assignments: [
        {
          variableId: "title",
          source: { kind: "variable", variableId: "missing", fieldPath: ["name"] },
        },
      ],
    };
    expect(diagnoseSlot(invalidSource, [block])[0]?.category).toBe("missingInputPath");

    const first = emptyBlock("First");
    const second = emptyBlock("Second");
    const firstCycle = {
      ...first,
      canvas: {
        ...first.canvas,
        root: {
          ...first.canvas.root,
          children: [{ id: "first-slot", type: "slot" as const, blockId: second.id }],
        },
      },
    };
    const secondCycle = {
      ...second,
      canvas: {
        ...second.canvas,
        root: {
          ...second.canvas.root,
          children: [{ id: "second-slot", type: "slot" as const, blockId: first.id }],
        },
      },
    };
    const cycleSlot: SlotElement = {
      id: "outer-slot",
      type: "slot",
      blockId: first.id,
    };
    expect(diagnoseSlot(cycleSlot, [firstCycle, secondCycle])[0]?.category).toBe("blockCycle");
  });
});
