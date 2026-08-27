import { describe, expect, it } from "vitest";
import { expandSlotInstances } from "./slots";

describe("Slot expansion", () => {
  it("preserves source order and uses current zero-based indices", () => {
    expect(expandSlotInstances(["first", "second"]).instances).toEqual([
      { index: 0, item: "first" },
      { index: 1, item: "second" },
    ]);
    expect(expandSlotInstances([]).instances).toEqual([]);
  });

  it("treats a scalar source as one item", () => {
    expect(expandSlotInstances("only").instances).toEqual([{ index: 0, item: "only" }]);
  });

  it("retains indexed diagnostics for invalid items", () => {
    const result = expandSlotInstances(["valid", null], (item, index) =>
      item === null
        ? { category: "invalidExpansionItem", message: `Invalid item ${index}.` }
        : undefined,
    );
    expect(result.instances).toEqual([
      { index: 0, item: "valid" },
      {
        index: 1,
        item: null,
        diagnostic: { category: "invalidExpansionItem", message: "Invalid item 1." },
      },
    ]);
  });
});
