import { describe, expect, it } from "vitest";

import { UndoCoordinator } from "./undo-coordinator";
import type { UndoTarget, UndoTargetStacks } from "./undo-coordinator";

/** A stack that only remembers how many entries it holds, and what was called on it. */
function fakeStacks(coordinator: UndoCoordinator) {
  const calls: string[] = [];
  const depth: Record<UndoTarget, { done: number; undone: number }> = {
    graph: { done: 0, undone: 0 },
    canvas: { done: 0, undone: 0 },
  };
  const stacks = {
    graph: stackFor("graph"),
    canvas: stackFor("canvas"),
  } as unknown as UndoTargetStacks;

  function stackFor(target: UndoTarget) {
    return {
      get canUndo() {
        return depth[target].done > 0;
      },
      get canRedo() {
        return depth[target].undone > 0;
      },
      undo() {
        calls.push(`undo:${target}`);
        depth[target].done -= 1;
        depth[target].undone += 1;
        // An inverse travels to the server the same way a user edit does, so it reaches the
        // coordinator too — which must not read it as a new action.
        coordinator.record(target);
      },
      redo() {
        calls.push(`redo:${target}`);
        depth[target].undone -= 1;
        depth[target].done += 1;
        coordinator.record(target);
      },
    };
  }

  return {
    calls,
    stacks,
    edit(target: UndoTarget) {
      depth[target].done += 1;
      depth[target].undone = 0;
      coordinator.record(target);
    },
  };
}

describe("UndoCoordinator", () => {
  it("reverses one action at a time, newest first", () => {
    const coordinator = new UndoCoordinator();
    const { calls, stacks, edit } = fakeStacks(coordinator);

    edit("graph");
    edit("canvas");
    coordinator.undo(stacks);
    coordinator.undo(stacks);

    expect(calls).toEqual(["undo:canvas", "undo:graph"]);
  });

  it("undoes a linked action as one, and in the reverse of the order it was applied", () => {
    const coordinator = new UndoCoordinator();
    const { calls, stacks, edit } = fakeStacks(coordinator);

    coordinator.link(() => {
      edit("graph");
      edit("canvas");
    });
    coordinator.undo(stacks);

    // The Slot goes before the Block it references; redo puts the Block back first.
    expect(calls).toEqual(["undo:canvas", "undo:graph"]);
    coordinator.redo(stacks);
    expect(calls.slice(2)).toEqual(["redo:graph", "redo:canvas"]);
  });

  it("does not record the inverses it applies as new actions", () => {
    const coordinator = new UndoCoordinator();
    const { calls, stacks, edit } = fakeStacks(coordinator);
    coordinator.link(() => {
      edit("graph");
      edit("canvas");
    });
    coordinator.undo(stacks);
    coordinator.redo(stacks);
    coordinator.undo(stacks);

    expect(calls).toEqual([
      "undo:canvas",
      "undo:graph",
      "redo:graph",
      "redo:canvas",
      "undo:canvas",
      "undo:graph",
    ]);
  });

  it("drops the redo history once a new action lands", () => {
    const coordinator = new UndoCoordinator();
    const { calls, stacks, edit } = fakeStacks(coordinator);

    edit("graph");
    coordinator.undo(stacks);
    edit("canvas");
    coordinator.redo(stacks);

    expect(calls).toEqual(["undo:graph"]);
  });

  it("still undoes whatever a stack holds when it has no record of the action", () => {
    const coordinator = new UndoCoordinator();
    const { calls, stacks, edit } = fakeStacks(coordinator);

    edit("canvas");
    coordinator.clear();
    expect(coordinator.canUndo(stacks)).toBe(true);
    coordinator.undo(stacks);

    expect(calls).toEqual(["undo:canvas"]);
  });
});
