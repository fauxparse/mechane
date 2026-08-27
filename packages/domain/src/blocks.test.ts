import { describe, expect, it } from "vitest";
import { emptyBlock, resolveBlockState, assertValidBlock } from "./blocks";

describe("Block aggregate", () => {
  it("starts with an empty valid Block Canvas", () => {
    const block = emptyBlock("Welcome");
    expect(() => assertValidBlock(block)).not.toThrow();
    expect(block.canvas.kind).toBe("block");
    expect(block.canvas.root.type).toBe("frame");
    expect(block.canvas.root.children).toEqual([]);
  });

  it("resolves selectors case-insensitively and falls back to default", () => {
    const block = {
      ...emptyBlock("Welcome"),
      states: [
        { id: "state-default", name: "Default", isDefault: true, overrides: [] },
        { id: "state-live", name: "Live", isDefault: false, overrides: [] },
      ],
    };
    expect(resolveBlockState(block, "LIVE")?.id).toBe("state-live");
    expect(resolveBlockState(block, "missing")?.id).toBe("state-default");
    expect(resolveBlockState(block, " ")?.id).toBe("state-default");
  });
});
