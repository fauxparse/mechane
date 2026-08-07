import { describe, expect, it } from "vitest";

import { editorIntentFor } from "./editor-keys";
import type { FocusContext } from "./viewport-keys";

const FREE: FocusContext = { nodeHasFocus: false, inKeyConsumingWidget: false };
const NODE_FOCUSED: FocusContext = { nodeHasFocus: true, inKeyConsumingWidget: false };
const TYPING: FocusContext = { nodeHasFocus: false, inKeyConsumingWidget: true };

describe("editorIntentFor", () => {
  it("opens the palette on Mod+K", () => {
    expect(editorIntentFor({ key: "k", metaKey: true }, FREE)).toBe("open-palette");
    expect(editorIntentFor({ key: "k", ctrlKey: true }, FREE)).toBe("open-palette");
  });

  // The palette is the universal surface (#37), so it's the one binding that
  // still works with focus in a field — a director mid-rename can still reach it.
  it("opens the palette even while typing", () => {
    expect(editorIntentFor({ key: "k", metaKey: true }, TYPING)).toBe("open-palette");
  });

  it("deletes the selection on Backspace and Delete", () => {
    expect(editorIntentFor({ key: "Backspace" }, FREE)).toBe("delete-selection");
    expect(editorIntentFor({ key: "Delete" }, NODE_FOCUSED)).toBe("delete-selection");
  });

  it("renames on F2", () => {
    expect(editorIntentFor({ key: "F2" }, NODE_FOCUSED)).toBe("rename");
  });

  it("selects all on Mod+A", () => {
    expect(editorIntentFor({ key: "a", metaKey: true }, FREE)).toBe("select-all");
    expect(editorIntentFor({ key: "a", ctrlKey: true }, FREE)).toBe("select-all");
  });

  // Figma's framing keys (#37). `!` and `@` are what Shift+1/2 report on a US
  // layout; the digits are what some others report.
  it("frames on Shift+1 and Shift+2, however the layout reports them", () => {
    expect(editorIntentFor({ key: "!", shiftKey: true }, FREE)).toBe("fit-graph");
    expect(editorIntentFor({ key: "1", shiftKey: true }, FREE)).toBe("fit-graph");
    expect(editorIntentFor({ key: "@", shiftKey: true }, FREE)).toBe("zoom-to-selection");
    expect(editorIntentFor({ key: "2", shiftKey: true }, FREE)).toBe("zoom-to-selection");
  });

  it("deselects on Escape", () => {
    expect(editorIntentFor({ key: "Escape" }, FREE)).toBe("deselect");
  });

  // React Flow's own `isInputDOMNode` covers its keys, not these (#37) — so
  // Mod+A must not select the graph while a name is being typed.
  it("yields nothing else while the user is typing", () => {
    for (const chord of [
      { key: "Backspace" },
      { key: "Delete" },
      { key: "F2" },
      { key: "a", metaKey: true },
      { key: "!", shiftKey: true },
      { key: "Escape" },
    ]) {
      expect(editorIntentFor(chord, TYPING)).toBeNull();
    }
  });

  it("leaves modified variants alone", () => {
    expect(editorIntentFor({ key: "Backspace", metaKey: true }, FREE)).toBeNull();
    expect(editorIntentFor({ key: "a", metaKey: true, altKey: true }, FREE)).toBeNull();
    expect(editorIntentFor({ key: "k", metaKey: true, shiftKey: true }, FREE)).toBeNull();
    // Both command modifiers at once isn't a binding anywhere.
    expect(editorIntentFor({ key: "a", metaKey: true, ctrlKey: true }, FREE)).toBeNull();
  });

  // Undo/redo and zoom belong to their own modules; this one must not claim them.
  it("leaves keys other modules own alone", () => {
    for (const chord of [
      { key: "z", metaKey: true },
      { key: "+" },
      { key: "-" },
      { key: "ArrowLeft" },
      { key: "Tab" },
      { key: "Enter" },
      { key: " " },
      { key: "b" },
    ]) {
      expect(editorIntentFor(chord, FREE)).toBeNull();
    }
  });
});
