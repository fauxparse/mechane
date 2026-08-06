import { describe, expect, it, vi } from "vitest";

import { capturing } from "./command";
import type { Command } from "./command";
import { CommandStack } from "./stack";
import type { CommandStackOptions } from "./stack";

interface Doc {
  title: string;
  x: number;
}

const DOC: Doc = { title: "Hamlet", x: 0 };

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

/** An absolute move, as a drag emits: "the node is now at x". */
function moveTo(x: number): Command<Doc> {
  return capturing<Doc, number>({
    type: "doc.moveTo",
    label: "Move",
    scope: "selection",
    capture: (doc) => doc.x,
    isEmpty: (_doc, captured) => captured === x,
    apply: (doc) => ({ ...doc, x }),
    restore: (doc, captured) => ({ ...doc, x: captured }),
  });
}

/** A relative nudge, so coalescing is tested against deltas as well. */
function nudge(dx: number): Command<Doc> {
  return capturing<Doc, null>({
    type: "doc.nudge",
    label: "Nudge",
    scope: "selection",
    capture: () => null,
    apply: (doc) => ({ ...doc, x: doc.x + dx }),
    restore: (doc) => ({ ...doc, x: doc.x - dx }),
  });
}

function stack(options: Partial<CommandStackOptions<Doc>> = {}) {
  return new CommandStack<Doc>({ state: DOC, ...options });
}

describe("CommandStack", () => {
  it("starts with nothing to undo or redo", () => {
    const commands = stack();
    expect(commands.state).toEqual(DOC);
    expect(commands.canUndo).toBe(false);
    expect(commands.canRedo).toBe(false);
    expect(commands.undoLabel).toBeNull();
  });

  it("applies a command and makes it undoable", () => {
    const commands = stack();
    commands.execute(setTitle("Macbeth"));
    expect(commands.state.title).toBe("Macbeth");
    expect(commands.canUndo).toBe(true);
    expect(commands.undoLabel).toBe("Rename");
  });

  it("undoes and redoes, reporting the edit's label in both directions", () => {
    const commands = stack();
    commands.execute(setTitle("Macbeth"));

    expect(commands.undo()).toBe(true);
    expect(commands.state.title).toBe("Hamlet");
    expect(commands.canUndo).toBe(false);
    expect(commands.redoLabel).toBe("Rename");

    expect(commands.redo()).toBe(true);
    expect(commands.state.title).toBe("Macbeth");
    expect(commands.canRedo).toBe(false);
  });

  it("undoes several edits in reverse order", () => {
    const commands = stack();
    commands.execute(setTitle("Macbeth"));
    commands.execute(setTitle("Lear"));
    commands.execute(moveTo(40));

    commands.undo();
    expect(commands.state).toEqual({ title: "Lear", x: 0 });
    commands.undo();
    expect(commands.state).toEqual({ title: "Macbeth", x: 0 });
    commands.undo();
    expect(commands.state).toEqual(DOC);
    expect(commands.undo()).toBe(false);
  });

  it("redoes several edits in the order they were made", () => {
    const commands = stack();
    commands.execute(setTitle("Macbeth"));
    commands.execute(moveTo(40));
    commands.undo();
    commands.undo();

    commands.redo();
    expect(commands.state).toEqual({ title: "Macbeth", x: 0 });
    commands.redo();
    expect(commands.state).toEqual({ title: "Macbeth", x: 40 });
    expect(commands.redo()).toBe(false);
  });

  it("discards the redoable future once a new edit lands", () => {
    const commands = stack();
    commands.execute(setTitle("Macbeth"));
    commands.undo();
    expect(commands.canRedo).toBe(true);

    commands.execute(moveTo(40));
    expect(commands.canRedo).toBe(false);
  });

  it("lands no entry for a command that changes nothing", () => {
    const commands = stack();
    commands.execute(setTitle("Hamlet"));
    expect(commands.canUndo).toBe(false);
    expect(commands.state).toEqual(DOC);
  });

  it("forgets the oldest entries past its limit", () => {
    const commands = stack({ limit: 2 });
    commands.execute(moveTo(1));
    commands.execute(moveTo(2));
    commands.execute(moveTo(3));
    expect(commands.depth).toBe(2);

    commands.undo();
    commands.undo();
    // The first move is beyond the horizon, so x never returns to 0.
    expect(commands.state.x).toBe(1);
    expect(commands.canUndo).toBe(false);
  });

  it("reports every state change, mid-gesture included", () => {
    const onChange = vi.fn();
    const commands = stack({ onChange });
    commands.execute(setTitle("Macbeth"));
    commands.undo();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith({ title: "Hamlet", x: 0 });
  });

  it("forgets history on reset, and takes new state when given it", () => {
    const commands = stack();
    commands.execute(setTitle("Macbeth"));
    commands.reset({ title: "Lear", x: 9 });
    expect(commands.state).toEqual({ title: "Lear", x: 9 });
    expect(commands.canUndo).toBe(false);
    expect(commands.canRedo).toBe(false);
  });
});

// ADR-0005: an undo is not a rollback, it's the inverse sent forward. The
// dispatch hook is where "sent" happens, so what shows up there is the whole
// contract with the sync layer.
describe("CommandStack dispatch", () => {
  it("dispatches an undo as an ordinary forward command", () => {
    const dispatch = vi.fn();
    const commands = stack({ dispatch });
    commands.execute(setTitle("Macbeth"));
    commands.undo();
    commands.redo();

    expect(dispatch).toHaveBeenCalledTimes(3);
    const [forward, undone, redone] = dispatch.mock.calls.map(
      ([command]) => command as Command<Doc>,
    );
    // Same type and scope as the original edit — nothing marks it as special.
    expect(undone?.type).toBe(forward?.type);
    expect(undone?.scope).toBe(forward?.scope);
    expect(redone?.type).toBe(forward?.type);
    // Each is dispatched with the state it produced.
    expect(dispatch.mock.calls[1]?.[1]).toEqual({ title: "Hamlet", x: 0 });
  });

  it("dispatches nothing for a command that changes nothing", () => {
    const dispatch = vi.fn();
    const commands = stack({ dispatch });
    commands.execute(setTitle("Hamlet"));
    expect(dispatch).not.toHaveBeenCalled();
  });
});

// #28: a continuous gesture is one undo entry per *completed* gesture —
// never one per frame or keystroke.
describe("CommandStack gestures", () => {
  it("collapses a whole drag into one entry", () => {
    const commands = stack();
    const drag = commands.beginGesture({ key: "drag", label: "Move" });
    for (const x of [4, 12, 28, 40]) drag.update(moveTo(x));

    // Every frame is visible immediately; none of them is an entry yet.
    expect(commands.state.x).toBe(40);
    expect(commands.canUndo).toBe(false);

    expect(drag.commit()).toBe(true);
    expect(commands.depth).toBe(1);
    expect(commands.undoLabel).toBe("Move");

    commands.undo();
    // One Cmd+Z, back to where the drag started — not to frame three.
    expect(commands.state.x).toBe(0);
    expect(commands.canUndo).toBe(false);
  });

  it("collapses a gesture built from deltas just as exactly", () => {
    const commands = stack();
    const drag = commands.beginGesture({ key: "drag", label: "Nudge" });
    drag.update(nudge(4));
    drag.update(nudge(4));
    drag.update(nudge(-2));
    drag.commit();

    expect(commands.state.x).toBe(6);
    commands.undo();
    expect(commands.state.x).toBe(0);
    commands.redo();
    expect(commands.state.x).toBe(6);
  });

  it("collapses a typed rename into one entry", () => {
    const commands = stack();
    const typing = commands.beginGesture({ key: "rename", label: "Rename" });
    for (const name of ["V", "Vo", "Vot", "Voti", "Votin", "Voting"]) {
      typing.update(setTitle(name));
    }
    typing.commit();

    expect(commands.depth).toBe(1);
    commands.undo();
    expect(commands.state.title).toBe("Hamlet");
  });

  it("dispatches a gesture once, coalesced, when it commits", () => {
    const dispatch = vi.fn();
    const commands = stack({ dispatch });
    const drag = commands.beginGesture({ key: "drag", label: "Move" });
    drag.update(moveTo(4));
    drag.update(moveTo(40));
    expect(dispatch).not.toHaveBeenCalled();

    drag.commit();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[1]).toEqual({ title: "Hamlet", x: 40 });
  });

  it("hands back the open gesture rather than starting a second one", () => {
    const commands = stack();
    const first = commands.beginGesture({ key: "drag", label: "Move" });
    first.update(moveTo(4));
    const second = commands.beginGesture({ key: "drag", label: "Move" });
    second.update(moveTo(40));
    second.commit();

    expect(commands.depth).toBe(1);
    expect(commands.openGesture).toBeNull();
  });

  it("commits an open gesture when a different one starts", () => {
    const commands = stack();
    commands.beginGesture({ key: "drag", label: "Move" }).update(moveTo(40));
    commands.beginGesture({ key: "rename", label: "Rename" }).update(setTitle("Macbeth"));

    expect(commands.depth).toBe(1);
    expect(commands.undoLabel).toBe("Move");
  });

  it("commits an open gesture before an unrelated command", () => {
    const commands = stack();
    commands.beginGesture({ key: "drag", label: "Move" }).update(moveTo(40));
    commands.execute(setTitle("Macbeth"));

    expect(commands.depth).toBe(2);
    commands.undo();
    expect(commands.state).toEqual({ title: "Hamlet", x: 40 });
  });

  it("undoes the gesture, not what came before it, when Cmd+Z lands mid-drag", () => {
    const commands = stack();
    commands.execute(setTitle("Macbeth"));
    commands.beginGesture({ key: "drag", label: "Move" }).update(moveTo(40));

    commands.undo();
    expect(commands.state).toEqual({ title: "Macbeth", x: 0 });
  });

  it("lands nothing for a gesture that never updated", () => {
    const commands = stack();
    const drag = commands.beginGesture({ key: "drag", label: "Move" });
    expect(drag.isEmpty).toBe(true);
    expect(drag.commit()).toBe(false);
    expect(commands.canUndo).toBe(false);
  });

  it("lands nothing for a gesture that ended where it started", () => {
    const commands = stack();
    const drag = commands.beginGesture({ key: "drag", label: "Move" });
    // A click on a node: React Flow reports a drag, the node hasn't moved.
    drag.update(moveTo(0));
    expect(drag.commit()).toBe(false);
    expect(commands.canUndo).toBe(false);
  });

  it("rolls the state back when a gesture is abandoned", () => {
    const commands = stack();
    const drag = commands.beginGesture({ key: "drag", label: "Move" });
    drag.update(moveTo(4));
    drag.update(moveTo(40));

    expect(drag.abort()).toEqual(DOC);
    expect(commands.state).toEqual(DOC);
    expect(commands.canUndo).toBe(false);
    expect(commands.openGesture).toBeNull();
  });

  it("closes for good once committed", () => {
    const commands = stack();
    const drag = commands.beginGesture({ key: "drag", label: "Move" });
    drag.update(moveTo(40));
    drag.commit();

    expect(drag.isOpen).toBe(false);
    expect(() => drag.update(moveTo(80))).toThrow(/already ended/);
    expect(drag.commit()).toBe(false);
  });

  it("exposes the gesture in progress", () => {
    const commands = stack();
    expect(commands.openGesture).toBeNull();
    const drag = commands.beginGesture({ key: "drag", label: "Move" });
    expect(commands.openGesture?.key).toBe("drag");
    drag.commit();
    expect(commands.openGesture).toBeNull();
  });
});
