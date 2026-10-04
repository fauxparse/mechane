import type { ShowGraph } from "@mechane/domain/graph";
import { defaultSourceValues } from "@mechane/domain/source-defaults";
import { generateId } from "@mechane/domain/id";
import type { StructuredValueTemplate } from "@mechane/domain/structured-values";
import { defaultReplacementEntries } from "@mechane/domain/value-transfer";
import { describe, expect, it } from "vitest";

import { CommandStack } from "./stack";
import { replaceSourceDefaults } from "./source-value-command";

const graph: ShowGraph = {
  shapes: [
    {
      id: "person",
      name: "Person",
      fields: [
        { id: "nickname", name: "Nickname", type: "text", required: false, defaultValue: "Guest" },
        { id: "score", name: "Score", type: "number", required: true, defaultValue: 0 },
      ],
    },
  ],
  nodes: [
    {
      id: "profile",
      name: "Profile",
      kind: "source",
      parentId: null,
      position: { x: 0, y: 0 },
      type: { kind: "shape", shapeId: "person" },
    },
  ],
  edges: [],
  sourceFieldDefaults: [{ nodeId: "profile", fieldPath: ["score"], value: 12 }],
};

describe("Source Default replacement history", () => {
  it("stores explicit absence while preserving sibling inheritance and one reversible entry", () => {
    const after = defaultReplacementEntries(graph, "profile", ["nickname"], null);
    const stack = new CommandStack({ state: graph });
    stack.execute(replaceSourceDefaults(graph.sourceFieldDefaults ?? [], after));
    expect(defaultSourceValues(stack.state).profile).toEqual({ nickname: null, score: 12 });
    expect(stack.state.sourceFieldDefaults).toContainEqual({
      nodeId: "profile",
      fieldPath: ["nickname"],
      value: null,
    });
    stack.undo();
    expect(defaultSourceValues(stack.state).profile).toEqual({ nickname: "Guest", score: 12 });
    expect(stack.canUndo).toBe(false);
    stack.redo();
    expect(defaultSourceValues(stack.state).profile).toEqual({ nickname: null, score: 12 });
  });

  it("restores prior authored structured identities, then reuses the same replacement on Redo", () => {
    const previous: StructuredValueTemplate = {
      id: generateId("structuredValue"),
      kind: "shape",
      fields: { nickname: "Before", score: 12 },
    };
    const replacement: StructuredValueTemplate = {
      id: generateId("structuredValue"),
      kind: "shape",
      fields: { nickname: null, score: 5 },
    };
    const before = [{ nodeId: "profile", fieldPath: [], value: previous }];
    const after = [{ nodeId: "profile", fieldPath: [], value: replacement }];
    const stack = new CommandStack<ShowGraph>({ state: { ...graph, sourceFieldDefaults: before } });
    stack.execute(replaceSourceDefaults(before, after));
    expect(defaultSourceValues(stack.state).profile).toEqual({ nickname: null, score: 5 });
    stack.undo();
    expect(stack.state.sourceFieldDefaults?.[0]?.value).toEqual(previous);
    stack.redo();
    expect(stack.state.sourceFieldDefaults?.[0]?.value).toEqual(replacement);
  });

  it("refuses history against changed authored intent without overwriting the new Default", () => {
    const replacement = replaceSourceDefaults(graph.sourceFieldDefaults ?? [], [
      { nodeId: "profile", fieldPath: ["score"], value: 5 },
    ]);
    const changed: ShowGraph = {
      ...graph,
      sourceFieldDefaults: [{ nodeId: "profile", fieldPath: ["score"], value: 99 }],
    };
    expect(() => replacement.apply(changed)).toThrow("authored Source Defaults changed");
    expect(defaultSourceValues(changed).profile).toEqual({ nickname: "Guest", score: 99 });
  });
});
