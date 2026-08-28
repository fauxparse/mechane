// One Cmd+Z, two stacks (#426).
//
// The Canvas editor edits two documents at once: the Show graph, which owns Blocks, and the
// Canvas workspace, which owns the Elements on each Artboard. Each has its own command stack,
// which is right — they are different states with different vocabularies — but a single user
// action can land in both. "Create Block from selection" is exactly that: the Block goes to the
// graph, the Slot that replaces the selection goes to the Canvas.
//
// So something has to remember which stacks one action touched, and in what order, or undo
// reverses half of it. That is all this is: an ordered history of *which* stacks each user action
// reached, driving them together and in the right direction.
//
// Order matters in both directions. Creating a Block adds the Block and *then* the Slot that
// references it, so undo has to take the Slot away before the Block — a Block a Slot still points
// at cannot be deleted — and redo has to put the Block back first.

export type UndoTarget = "graph" | "canvas";

export interface UndoTargetStack {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  undo(): void;
  redo(): void;
}

export type UndoTargetStacks = Readonly<Record<UndoTarget, UndoTargetStack>>;

const TARGETS: readonly UndoTarget[] = ["graph", "canvas"];

/**
 * Records which stacks each user action reached, and replays that record backwards and forwards.
 *
 * Recording is driven by the same callback the stacks already use to send their edits to the
 * server, so an action is recorded exactly when it produces edits. Undo and redo suppress
 * recording while they run — an inverse travels as an ordinary forward command, and would
 * otherwise be recorded as a new action.
 */
export class UndoCoordinator {
  private done: UndoTarget[][] = [];
  private undone: UndoTarget[][] = [];
  private open: UndoTarget[] | null = null;
  private replaying = false;
  /** Whether anything has been recorded since the last reset — see the fallback in `undo`. */
  private tracked = false;

  /** Notes that `target`'s stack just took an edit from the user. */
  record(target: UndoTarget): void {
    if (this.replaying) return;
    this.tracked = true;
    if (this.open) {
      if (!this.open.includes(target)) this.open.push(target);
      return;
    }
    this.done.push([target]);
    this.undone = [];
  }

  /** Everything recorded while `run` executes is one action, undone and redone as one. */
  link<T>(run: () => T): T {
    const previous = this.open;
    this.open = [];
    try {
      return run();
    } finally {
      const step = this.open ?? [];
      this.open = previous;
      if (step.length === 0) {
        // Nothing was recorded, so there is no action to remember.
      } else if (previous) {
        // A nested link is part of the action already open, not one of its own.
        for (const target of step) {
          if (!previous.includes(target)) previous.push(target);
        }
      } else {
        this.done.push(step);
        this.undone = [];
      }
    }
  }

  /** Forgets the history, for when the stacks themselves are reset from the server. */
  clear(): void {
    this.done = [];
    this.undone = [];
    this.open = null;
    this.tracked = false;
  }

  canUndo(stacks: UndoTargetStacks): boolean {
    if (this.done.length > 0) return true;
    return !this.tracked && TARGETS.some((target) => stacks[target].canUndo);
  }

  canRedo(stacks: UndoTargetStacks): boolean {
    if (this.undone.length > 0) return true;
    return !this.tracked && TARGETS.some((target) => stacks[target].canRedo);
  }

  undo(stacks: UndoTargetStacks): void {
    const step = this.done.pop();
    // No record, and nothing was ever recorded — the stacks hold edits from before this
    // coordinator saw them. Undo one anyway, rather than leaving a history the user cannot
    // reach. Once anything *has* been recorded, an empty history means there is nothing to undo.
    const targets = step ?? this.fallback((target) => stacks[target].canUndo);
    this.replay(
      [...targets].reverse(),
      (target) => stacks[target].canUndo,
      (target) => stacks[target].undo(),
    );
    if (step) this.undone.push(step);
  }

  redo(stacks: UndoTargetStacks): void {
    const step = this.undone.pop();
    const targets = step ?? this.fallback((target) => stacks[target].canRedo);
    this.replay(
      targets,
      (target) => stacks[target].canRedo,
      (target) => stacks[target].redo(),
    );
    if (step) this.done.push(step);
  }

  private fallback(ready: (target: UndoTarget) => boolean): readonly UndoTarget[] {
    if (this.tracked) return [];
    return TARGETS.filter(ready).slice(0, 1);
  }

  private replay(
    order: readonly UndoTarget[],
    ready: (target: UndoTarget) => boolean,
    run: (target: UndoTarget) => void,
  ): void {
    if (order.length === 0) return;
    this.replaying = true;
    try {
      for (const target of order) if (ready(target)) run(target);
    } finally {
      this.replaying = false;
    }
  }
}
