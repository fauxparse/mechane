import { describe, expect, it } from "vitest";

import { containingFrame, rankForInsertion } from "./canvas-creation";

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
  right: x + width,
  bottom: y + height,
});

describe("Canvas creation tools", () => {
  it("chooses the smallest containing Frame at commit time", () => {
    expect(
      containingFrame(
        [
          { id: "root", rect: rect(0, 0, 500, 500) },
          { id: "nested", rect: rect(20, 20, 200, 200) },
        ],
        rect(40, 40, 20, 20),
      ),
    ).toBe("nested");
  });

  it("allocates deterministic ranks before, between, and after siblings", () => {
    expect(rankForInsertion([], 0)).toBe("a");
    expect(rankForInsertion(["a", "c"], 0)).toBe("!a");
    expect(rankForInsertion(["a", "c"], 1)).toBe("a~");
    expect(rankForInsertion(["a", "c"], 2)).toBe("c~");
  });
});
