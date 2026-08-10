import { describe, expect, it } from "vitest";

import { containingFrame, dropChangesParentOrPosition, rankForInsertion } from "./canvas-creation";

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

  it("only highlights drops that change parent or auto-layout position", () => {
    expect(dropChangesParentOrPosition("frame-a", "b", "frame-a", false, "a~")).toBe(false);
    expect(dropChangesParentOrPosition("frame-a", "b", "frame-a", true, "b")).toBe(false);
    expect(dropChangesParentOrPosition("frame-a", "b", "frame-a", true, "a~")).toBe(true);
    expect(dropChangesParentOrPosition("frame-a", "b", "frame-b", false, "b")).toBe(true);
  });

  it("allocates deterministic ranks before, between, and after siblings", () => {
    expect(rankForInsertion([], 0)).toBe("a");
    expect(rankForInsertion(["a", "c"], 0)).toBe("!a");
    expect(rankForInsertion(["a", "c"], 1)).toBe("a~");
    expect(rankForInsertion(["a", "c"], 2)).toBe("c~");
  });
});
