import { describe, expect, it } from "vitest";
import { assertAcyclicBlockReferences, BlockCycleError, emptyBlock } from "./blocks";

describe("Block reference graph", () => {
  it("rejects direct cycles with the full chain", () => {
    const block = emptyBlock("Self");
    const cyclic = {
      ...block,
      canvas: {
        ...block.canvas,
        root: {
          ...block.canvas.root,
          children: [{ id: "slot", type: "slot" as const, blockId: block.id }],
        },
      },
    };
    expect(() => assertAcyclicBlockReferences([cyclic])).toThrow(BlockCycleError);
    try {
      assertAcyclicBlockReferences([cyclic]);
    } catch (error) {
      expect(error).toMatchObject({ chain: [block.id, block.id] });
    }
  });
});
