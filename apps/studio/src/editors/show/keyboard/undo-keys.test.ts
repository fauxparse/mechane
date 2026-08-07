import { describe, expect, it } from "vitest";

import { undoIntentFor } from "./undo-keys";
import type { FocusContext } from "./viewport-keys";

const FREE: FocusContext = { nodeHasFocus: false, inKeyConsumingWidget: false };
const NODE_FOCUSED: FocusContext = { nodeHasFocus: true, inKeyConsumingWidget: false };
const TYPING: FocusContext = { nodeHasFocus: false, inKeyConsumingWidget: true };

describe("undoIntentFor", () => {
  it("undoes on Cmd+Z and Ctrl+Z", () => {
    expect(undoIntentFor({ key: "z", metaKey: true }, FREE)).toBe("undo");
    expect(undoIntentFor({ key: "z", ctrlKey: true }, FREE)).toBe("undo");
  });

  it("redoes on Shift+Cmd+Z and Shift+Ctrl+Z", () => {
    expect(undoIntentFor({ key: "z", metaKey: true, shiftKey: true }, FREE)).toBe("redo");
    expect(undoIntentFor({ key: "z", ctrlKey: true, shiftKey: true }, FREE)).toBe("redo");
  });

  // Windows' other redo chord. Cmd+Y is deliberately not bound.
  it("redoes on Ctrl+Y but not Cmd+Y", () => {
    expect(undoIntentFor({ key: "y", ctrlKey: true }, FREE)).toBe("redo");
    expect(undoIntentFor({ key: "y", metaKey: true }, FREE)).toBeNull();
  });

  it("accepts a capital Z, which is what Shift+Z reports", () => {
    expect(undoIntentFor({ key: "Z", metaKey: true, shiftKey: true }, FREE)).toBe("redo");
  });

  // The rule that keeps graph undo out of a rename field's own undo — the
  // inline rename and the Show-name form both sit over the graph (#39, #42).
  it("yields nothing while the user is typing", () => {
    expect(undoIntentFor({ key: "z", metaKey: true }, TYPING)).toBeNull();
    expect(undoIntentFor({ key: "z", metaKey: true, shiftKey: true }, TYPING)).toBeNull();
  });

  // Unlike panning, undo has no quarrel with a focused node: React Flow
  // doesn't bind Cmd+Z, and the edit being undone may well be that node's.
  it("still undoes while a node holds focus", () => {
    expect(undoIntentFor({ key: "z", metaKey: true }, NODE_FOCUSED)).toBe("undo");
  });

  it("needs a command modifier", () => {
    expect(undoIntentFor({ key: "z" }, FREE)).toBeNull();
    expect(undoIntentFor({ key: "z", shiftKey: true }, FREE)).toBeNull();
  });

  it("leaves other modifier combinations alone", () => {
    expect(undoIntentFor({ key: "z", metaKey: true, altKey: true }, FREE)).toBeNull();
    // Both command modifiers at once isn't a binding anywhere.
    expect(undoIntentFor({ key: "z", metaKey: true, ctrlKey: true }, FREE)).toBeNull();
  });

  it("yields nothing for keys it doesn't own", () => {
    for (const key of ["a", "Z ", "Enter", "Escape", "ArrowLeft"]) {
      expect(undoIntentFor({ key, metaKey: true }, FREE)).toBeNull();
    }
  });
});
