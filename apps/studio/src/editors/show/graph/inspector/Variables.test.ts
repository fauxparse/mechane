import { describe, expect, it } from "vitest";

import { reorderVariableIndices } from "./variable-order";

describe("reorderVariableIndices", () => {
  it("moves an item to the projected sortable index", () => {
    expect(reorderVariableIndices(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(reorderVariableIndices(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("returns null for invalid or unchanged indices", () => {
    expect(reorderVariableIndices(["a", "b"], 0, 0)).toBeNull();
    expect(reorderVariableIndices(["a", "b"], -1, 0)).toBeNull();
    expect(reorderVariableIndices(["a", "b"], 0, 2)).toBeNull();
  });
});
