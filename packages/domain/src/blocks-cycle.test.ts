import { describe, expect, it } from "vitest";
import { assertValidShowGraph } from "./graph";
import type { Block } from "./blocks";
import { assertAcyclicBlockReferences, BlockCycleError, emptyBlock } from "./blocks";

function withSlot(block: Block, blockId: string): Block {
  return {
    ...block,
    canvas: {
      ...block.canvas,
      root: {
        ...block.canvas.root,
        children: [{ id: `${block.id}-slot`, type: "slot", blockId }],
      },
    },
  };
}

describe("Block reference graph", () => {
  it("rejects direct cycles with the full chain", () => {
    const block = withSlot(emptyBlock("Self"), "self");
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
    expect(() => assertAcyclicBlockReferences([cyclic])).toThrow(
      `Block reference cycle: ${block.id} -> ${block.id}`,
    );
  });

  it("rejects indirect cycles with the full reference chain", () => {
    const first = emptyBlock("First");
    const second = emptyBlock("Second");
    const cyclicFirst = withSlot(first, second.id);
    const cyclicSecond = withSlot(second, first.id);

    expect(() => assertAcyclicBlockReferences([cyclicFirst, cyclicSecond])).toThrow(
      `Block reference cycle: ${first.id} -> ${second.id} -> ${first.id}`,
    );
  });

  it("rejects cycles at the Show graph validation boundary", () => {
    const first = emptyBlock("First");
    const second = emptyBlock("Second");

    expect(() =>
      assertValidShowGraph({
        blocks: [withSlot(first, second.id), withSlot(second, first.id)],
        nodes: [],
        edges: [],
      }),
    ).toThrow(BlockCycleError);
  });
});
