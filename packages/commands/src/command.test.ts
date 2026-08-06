import { describe, expect, it } from "vitest";

import { capturing, composite, defineCommand, noop } from "./command";
import type { Command } from "./command";

/** A toy state, so the abstraction's rules are tested without a graph in the way. */
interface Doc {
  title: string;
  items: string[];
}

const DOC: Doc = { title: "Hamlet", items: ["a", "b", "c"] };

function setTitle(title: string): Command<Doc> {
  return capturing<Doc, string>({
    type: "doc.setTitle",
    label: "Rename",
    scope: "selection",
    capture: (doc) => doc.title,
    isEmpty: (_doc, captured) => captured === title,
    apply: (doc) => ({ ...doc, title }),
    restore: (doc, captured) => ({ ...doc, title: captured }),
  });
}

/** Deliberately a *delta*, not a set: coalescing has to invert these too. */
function appendItem(item: string): Command<Doc> {
  return capturing<Doc, null>({
    type: "doc.appendItem",
    label: "Add item",
    scope: "canvas",
    capture: () => null,
    apply: (doc) => ({ ...doc, items: [...doc.items, item] }),
    restore: (doc) => ({ ...doc, items: doc.items.slice(0, -1) }),
  });
}

/** Removes an item, capturing what it destroyed and where it sat (#28). */
function removeItem(index: number): Command<Doc> {
  return capturing<Doc, { index: number; item: string }>({
    type: "doc.removeItem",
    label: "Delete item",
    scope: "selection",
    capture: (doc) => ({ index, item: doc.items[index] as string }),
    apply: (doc) => ({ ...doc, items: doc.items.filter((_, i) => i !== index) }),
    restore: (doc, captured) => {
      const items = [...doc.items];
      items.splice(captured.index, 0, captured.item);
      return { ...doc, items };
    },
  });
}

describe("capturing", () => {
  it("applies forward and hands back an inverse that restores the old state", () => {
    const applied = setTitle("Macbeth").apply(DOC);
    expect(applied.state.title).toBe("Macbeth");
    expect(applied.inverse.apply(applied.state).state).toEqual(DOC);
  });

  it("does not mutate the state it was given", () => {
    setTitle("Macbeth").apply(DOC);
    expect(DOC.title).toBe("Hamlet");
  });

  // The whole reason the inverse is built during `apply`: afterwards, the
  // destroyed item is gone and nothing could reconstruct it (#28).
  it("inverts a destructive command from its snapshot, not from the new state", () => {
    const applied = removeItem(1).apply(DOC);
    expect(applied.state.items).toEqual(["a", "c"]);
    // Restored to its original index, not appended.
    expect(applied.inverse.apply(applied.state).state.items).toEqual(["a", "b", "c"]);
  });

  it("survives undo/redo/undo, capturing what it finds each hop", () => {
    const forward = setTitle("Macbeth").apply(DOC);
    const undone = forward.inverse.apply(forward.state);
    expect(undone.state.title).toBe("Hamlet");

    const redone = undone.inverse.apply(undone.state);
    expect(redone.state.title).toBe("Macbeth");
    expect(redone.inverse.apply(redone.state).state.title).toBe("Hamlet");
  });

  it("reports an empty inverse when it has nothing to do", () => {
    const applied = setTitle("Hamlet").apply(DOC);
    expect(applied.state).toEqual(DOC);
    expect(applied.inverse.isEmpty).toBe(true);
  });

  it("carries the scope it declared onto its inverse", () => {
    const applied = setTitle("Macbeth").apply(DOC);
    expect(applied.inverse.scope).toBe("selection");
  });
});

describe("composite", () => {
  const destroyTwo = composite<Doc>({
    label: "Delete both",
    commands: [removeItem(2), removeItem(0)],
  });

  it("applies its parts in order", () => {
    expect(destroyTwo.apply(DOC).state.items).toEqual(["b"]);
  });

  it("inverts its parts in reverse order, restoring everything exactly", () => {
    const applied = destroyTwo.apply(DOC);
    expect(applied.inverse.apply(applied.state).state).toEqual(DOC);
  });

  it("inverts deltas as exactly as it inverts sets", () => {
    const applied = composite<Doc>({
      label: "Add three",
      commands: [appendItem("d"), appendItem("e"), appendItem("f")],
    }).apply(DOC);
    expect(applied.state.items).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(applied.inverse.apply(applied.state).state).toEqual(DOC);
  });

  it("is redoable", () => {
    const applied = destroyTwo.apply(DOC);
    const undone = applied.inverse.apply(applied.state);
    expect(undone.state).toEqual(DOC);
    expect(undone.inverse.apply(undone.state).state.items).toEqual(["b"]);
  });

  // A promote's side effect belongs inside the same composite as the
  // membership change, so one undo reverts both (#28).
  it("welds a side effect to the change that caused it", () => {
    const promote = composite<Doc>({
      label: "Promote",
      commands: [appendItem("scene"), setTitle("Flow with a default")],
    });
    const applied = promote.apply(DOC);
    expect(applied.state).toEqual({
      title: "Flow with a default",
      items: ["a", "b", "c", "scene"],
    });
    expect(applied.inverse.apply(applied.state).state).toEqual(DOC);
  });

  it("drops empty parts and reports itself empty when nothing is left", () => {
    const nothing = composite<Doc>({
      label: "Nothing",
      commands: [setTitle("Hamlet"), noop()],
    });
    // `setTitle("Hamlet")` isn't statically empty — it discovers that on
    // apply — so the composite is only empty once its inverse comes back.
    expect(nothing.apply(DOC).inverse.isEmpty).toBe(true);
    expect(composite<Doc>({ label: "Nothing", commands: [] }).isEmpty).toBe(true);
  });

  it("takes its scope from its first part unless told otherwise", () => {
    expect(composite<Doc>({ label: "x", commands: [removeItem(0)] }).scope).toBe("selection");
    expect(composite<Doc>({ label: "x", commands: [appendItem("d")] }).scope).toBe("canvas");
    expect(composite<Doc>({ label: "x", scope: "global", commands: [removeItem(0)] }).scope).toBe(
      "global",
    );
  });
});

describe("defineCommand", () => {
  it("defaults to not being empty", () => {
    const command = defineCommand<Doc>({
      type: "doc.touch",
      label: "Touch",
      scope: "global",
      apply: (state) => ({ state, inverse: noop() }),
    });
    expect(command.isEmpty).toBe(false);
  });
});

describe("noop", () => {
  it("changes nothing and reverses to itself", () => {
    const applied = noop<Doc>().apply(DOC);
    expect(applied.state).toBe(DOC);
    expect(applied.inverse.isEmpty).toBe(true);
  });
});
