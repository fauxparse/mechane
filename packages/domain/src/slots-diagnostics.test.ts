import { describe, expect, it } from "vitest";
import { emptyBlock } from "./blocks";
import { diagnoseSlot } from "./slots";

describe("Slot diagnostics", () => {
  it("reports missing references and invalid layout without dropping configuration", () => {
    const block = emptyBlock("Card");
    const missing = { id: "slot", type: "slot" as const, blockId: "missing" };
    expect(diagnoseSlot(missing, [block])[0]?.category).toBe("missingBlock");
    const invalid = {
      id: "slot",
      type: "slot" as const,
      blockId: block.id,
      layoutMode: "absolute" as const,
    };
    expect(diagnoseSlot(invalid, [block])[0]?.category).toBe("invalidSlotLayout");
  });
});
