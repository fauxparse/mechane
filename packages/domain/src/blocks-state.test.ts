import { describe, expect, it } from "vitest";

import type { Block } from "./blocks";
import type { SlotElement } from "./canvas";
import {
  applyBlockState,
  assertValidBlock,
  emptyBlock,
  resolveBlockState,
  setBlockStateOverrides,
  setDefaultBlockState,
} from "./blocks";
import { resolveSlotInputs } from "./slots";

function statefulBlock(): Block {
  const base = emptyBlock("Card");
  const title = {
    id: "title",
    type: "text" as const,
    content: { kind: "variable" as const, variableId: "title" },
  };
  const nested = {
    id: "nested",
    type: "frame" as const,
    children: [
      title,
      { id: "slot", type: "slot" as const, blockId: "child-block", assignments: [] },
    ],
  };
  return {
    ...base,
    canvas: {
      ...base.canvas,
      root: { id: "root", type: "frame", children: [nested] },
    },
    variables: [
      { id: "selector", name: "State", type: "text", required: false },
      { id: "title", name: "Title", type: "text", required: false },
    ],
    states: [
      { id: "default", name: "Default", isDefault: true, overrides: [] },
      {
        id: "live",
        name: "Live",
        isDefault: false,
        overrides: [{ elementId: "title", property: "content", value: "Live" }],
      },
    ],
    stateSelectorVariableId: "selector",
  };
}

describe("Block States", () => {
  it("applies deep sparse overrides without changing structure or Slot configuration", () => {
    const block = statefulBlock();
    const resolved = applyBlockState(block, resolveBlockState(block, "live"));
    expect(resolved.root).toEqual({
      id: "root",
      type: "frame",
      children: [
        {
          id: "nested",
          type: "frame",
          children: [
            { id: "title", type: "text", content: "Live" },
            { id: "slot", type: "slot", blockId: "child-block", assignments: [] },
          ],
        },
      ],
    });
    expect(resolved.root.children?.[0]?.children).toHaveLength(2);
  });

  it("validates exactly one default and only existing Element properties", () => {
    const block = statefulBlock();
    expect(() => assertValidBlock({ ...block, states: [] })).not.toThrow();
    expect(() =>
      assertValidBlock({
        ...block,
        states: block.states.map((state) => ({ ...state, isDefault: false })),
      }),
    ).toThrow("exactly one Default State");
    expect(() =>
      assertValidBlock({
        ...block,
        states: block.states.map((state) => ({ ...state, isDefault: true })),
      }),
    ).toThrow("exactly one Default State");
    expect(() =>
      assertValidBlock({
        ...block,
        states: [
          ...block.states,
          {
            id: "invalid",
            name: "Invalid",
            isDefault: false,
            overrides: [{ elementId: "nested", property: "content", value: "bad" }],
          },
        ],
      }),
    ).toThrow("missing Property");
  });

  it("resolves selectors through Slot assignments and uses the base Canvas without States", () => {
    const block = statefulBlock();
    const slot: SlotElement = {
      id: "slot",
      type: "slot",
      blockId: block.id,
      assignments: [{ variableId: "selector", source: { kind: "literal", value: "live" } }],
    };
    const selected = resolveSlotInputs(block, slot);
    expect(resolveBlockState(block, selected.values.selector)?.id).toBe("live");
    expect(resolveBlockState(block, "")?.id).toBe("default");
    expect(resolveBlockState(block, "missing")?.id).toBe("default");

    const withoutStates = { ...block, states: [] };
    expect(resolveBlockState(withoutStates, "live")).toBeNull();
    expect(applyBlockState(withoutStates, null)).toEqual(withoutStates.canvas);
  });

  it("keeps state edits immutable and preserves one default", () => {
    const block = statefulBlock();
    const updated = setDefaultBlockState(block, "live");
    const withOverride = setBlockStateOverrides(updated, "default", [
      { elementId: "title", property: "content", value: "Default" },
    ]);

    expect(block.states.find((state) => state.isDefault)?.id).toBe("default");
    expect(withOverride.states.find((state) => state.isDefault)?.id).toBe("live");
    expect(withOverride.states.find((state) => state.id === "default")?.overrides).toEqual([
      { elementId: "title", property: "content", value: "Default" },
    ]);
  });
});
