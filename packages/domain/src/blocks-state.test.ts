import { describe, expect, it } from "vitest";
import { applyBlockState, emptyBlock, resolveBlockState } from "./blocks";

describe("Block States", () => {
  it("applies sparse property overrides without changing Canvas structure", () => {
    const block = {
      ...emptyBlock("Card"),
      canvas: {
        ...emptyBlock("Card").canvas,
        root: {
          id: "root",
          type: "frame" as const,
          children: [{ id: "title", type: "text" as const, content: "Base" }],
        },
      },
      states: [
        {
          id: "live",
          name: "Live",
          isDefault: true,
          overrides: [{ elementId: "title", property: "content", value: "Live" }],
        },
      ],
    };
    const resolved = applyBlockState(block, resolveBlockState(block, "live"));
    expect(resolved.root.children?.[0]).toMatchObject({ id: "title", content: "Live" });
  });
});
