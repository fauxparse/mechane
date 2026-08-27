import { describe, expect, it } from "vitest";
import { emptyBlock } from "./blocks";
import { resolveSlotInputs, expandSlotSource } from "./slots";

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
    const block = { ...emptyBlock("Card"), variables: [{ id: "title", name: "Title", type: "text" as const, required: true }] };
    const slot = { id: "slot", type: "slot" as const, blockId: block.id };
    expect(resolveSlotInputs(block, slot).diagnostics[0]?.category).toBe("missingRequiredInput");
    expect(expandSlotSource(["a", "b"]).items).toEqual(["a", "b"]);
    expect(expandSlotSource("a").items).toEqual(["a"]);
  });
});
