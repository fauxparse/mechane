import { describe, expect, it } from "vitest";

import { edgeStatus } from "./edge-status";
import type { ShowEdgeData } from "./graph-to-flow";

function edgeData(overrides: Partial<ShowEdgeData> = {}): ShowEdgeData {
  return {
    kind: "wiring",
    targetVariableId: null,
    coercing: false,
    conversion: null,
    invalidReason: null,
    warningReason: null,
    color: "neutral",
    sourceColor: "neutral",
    targetColor: "neutral",
    layout: null,
    parallelIndex: 0,
    parallelCount: 1,
    ...overrides,
  };
}

describe("edgeStatus", () => {
  it("says nothing about an ordinary edge", () => {
    expect(edgeStatus(edgeData()).glyph).toBeUndefined();
  });

  it("marks a first-item conversion, and explains it in the tooltip", () => {
    const status = edgeStatus(edgeData({ conversion: "firstItem" }));
    expect(status.glyph).toBe("①");
    expect(status.title).toMatch(/first item/i);
    expect(status.color).toBeUndefined();
  });

  it("keeps the badge but turns it destructive when the list is empty", () => {
    const status = edgeStatus(
      edgeData({ conversion: "firstItem", warningReason: "The list is empty." }),
    );
    expect(status.glyph).toBe("①");
    expect(status.title).toBe("The list is empty.");
    expect(status.color).toBe("var(--destructive)");
  });

  it("puts incompatible types ahead of everything else", () => {
    const status = edgeStatus(
      edgeData({ conversion: "firstItem", invalidReason: "Incompatible types" }),
    );
    expect(status.glyph).toBe("!");
    expect(status.title).toBe("Incompatible types");
  });

  it("still marks a plain coercion", () => {
    expect(edgeStatus(edgeData({ coercing: true })).glyph).toBe("↝");
  });
});
