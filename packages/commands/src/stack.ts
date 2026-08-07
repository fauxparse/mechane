// The undo/redo stack (issue #41, PRD §6.3, ADR-0005).
//
// Session-local by construction: it holds state and commands in memory,
// knows nothing about persistence, and is thrown away on reload. Undo is
// never a rollback — it applies the recorded inverse as an ordinary forward
// command and reports it through `dispatch` exactly like any other edit, so
// whatever syncs edits to the server has a single path to maintain
// (ADR-0005). Unlike the draft graph (ADR-0002), none of this survives a
// refresh, and that's the decision, not a gap.
//
// The interesting part is gestures. A drag emits a position every frame, a
// rename emits a name every keystroke, and an inspector field emits a value
// every change — and #28 says each of those is **one** undo entry per
// completed gesture (drag-end, blur, Enter/close), never one per frame. So
// "this gesture is still open" is a first-class state here: updates apply to
// the state immediately (the user has to see their drag), but no entry lands
// until the gesture commits, at which point the whole run collapses into a
// single composite.
//
// That also means the coalesced entry is correct for *delta* commands as
// well as absolute ones: the entry's inverse is every update's inverse in
// reverse order, not just the first one's, so a gesture built from "nudge by
// 4px" steps inverts as exactly as one built from "set position to (x, y)".

import { composite } from "./command";
import type { Command } from "./command";

/** How many entries the stack keeps before forgetting the oldest. */
export const DEFAULT_STACK_LIMIT = 100;

export interface CommandStackOptions<S, E = unknown> {
  /** The state the stack starts from. */
  state: S;
  /** Entries kept before the oldest is dropped. Defaults to 100. */
  limit?: number;
  /**
   * Called once per command that lands as an entry — including the inverses
   * applied by `undo`/`redo`, which is the whole point of ADR-0005: an undo
   * arrives here as an ordinary forward command.
   *
   * Gesture *frames* are deliberately not dispatched. A gesture reaches
   * here once, coalesced, when it commits (#28) — the intermediate states
   * are local feedback, not edits.
   */
  dispatch?(command: Command<S, E>, state: S, edits: readonly E[]): void;
  /** Called whenever `state` changes, including mid-gesture. */
  onChange?(state: S): void;
}

/** An open continuous gesture — a drag in progress, a name being typed. */
export interface Gesture<S, E = unknown> {
  /**
   * Identifies the gesture, so a per-frame caller can ask for "the drag
   * gesture" without tracking whether it already started one.
   */
  readonly key: string;
  readonly label: string;
  /** False once the gesture has committed or been abandoned. */
  readonly isOpen: boolean;
  /** True until the first `update`. */
  readonly isEmpty: boolean;
  /**
   * Applies one increment of the gesture — a frame of the drag, a keystroke
   * of the rename. Takes effect on the state immediately; adds nothing to
   * the stack.
   */
  update(command: Command<S, E>): S;
  /**
   * Ends the gesture, landing every update so far as **one** entry (#28).
   * Returns false if the gesture changed nothing, in which case no entry
   * lands — a click that nudged a node and put it back is not an edit.
   */
  commit(): boolean;
  /**
   * Abandons the gesture, rolling the state back to where it began (Escape
   * during a drag). Nothing reaches the stack. The rollback is applied as
   * forward commands, like every other reversal here.
   */
  abort(): S;
}

/**
 * What the stack remembers about one landed edit: the user-facing label, and
 * the command that reverses it. There's no need to keep the forward command
 * — applying an inverse produces the redo command (see ./command).
 */
interface StackEntry<S, E> {
  label: string;
  reverse: Command<S, E>;
}

interface OpenGesture<S, E> {
  key: string;
  label: string;
  /** Each update's inverse, in the order the updates were applied. */
  inverses: Command<S, E>[];
  /** The updates themselves, kept only to dispatch the coalesced edit. */
  updates: Command<S, E>[];
  /** Every update's edits, concatenated — the gesture as one wire batch. */
  edits: E[];
  open: boolean;
}

/**
 * A session-local undo/redo stack over one editor state.
 *
 * Both editors (Canvas and Show graph) use this same class — PRD §6.3's
 * "one shared Command abstraction" is this file plus ./command, and is why
 * undo behaves identically in both rather than being built twice.
 */
export class CommandStack<S, E = unknown> {
  #state: S;
  #undoable: StackEntry<S, E>[] = [];
  #redoable: StackEntry<S, E>[] = [];
  #gesture: OpenGesture<S, E> | null = null;
  readonly #limit: number;
  readonly #dispatch: ((command: Command<S, E>, state: S, edits: readonly E[]) => void) | undefined;
  readonly #onChange: ((state: S) => void) | undefined;

  constructor(options: CommandStackOptions<S, E>) {
    this.#state = options.state;
    this.#limit = Math.max(1, options.limit ?? DEFAULT_STACK_LIMIT);
    this.#dispatch = options.dispatch;
    this.#onChange = options.onChange;
  }

  get state(): S {
    return this.#state;
  }

  get canUndo(): boolean {
    return this.#undoable.length > 0;
  }

  get canRedo(): boolean {
    return this.#redoable.length > 0;
  }

  /** What Cmd+Z would undo, for a menu item or tooltip. */
  get undoLabel(): string | null {
    return this.#undoable.at(-1)?.label ?? null;
  }

  /** What Shift+Cmd+Z would redo. */
  get redoLabel(): string | null {
    return this.#redoable.at(-1)?.label ?? null;
  }

  /** How many entries are undoable. Mostly of interest to tests. */
  get depth(): number {
    return this.#undoable.length;
  }

  /** The gesture currently in progress, if any. */
  get openGesture(): Gesture<S, E> | null {
    return this.#gesture?.open ? this.#gestureHandle(this.#gesture) : null;
  }

  /**
   * Applies `command` and lands it as one undo entry, discarding anything
   * that was redoable — the usual branch-and-forget rule: once you edit
   * after undoing, the abandoned future is gone.
   *
   * Any open gesture commits first, so the entries stay in the order the
   * user made them.
   */
  execute(command: Command<S, E>): S {
    this.#closeGesture();
    if (command.isEmpty) return this.#state;

    const applied = command.apply(this.#state);
    // An empty inverse means the command found nothing to do (see
    // `Command.isEmpty`) — no entry, no dispatch, and the redoable future
    // survives, because nothing branched off it.
    if (applied.inverse.isEmpty) return this.#state;

    this.#redoable = [];
    this.#push(this.#undoable, { label: command.label, reverse: applied.inverse });
    return this.#commit(applied.state, command, applied.edits ?? []);
  }

  /**
   * Opens a continuous gesture, or returns the one already open under the
   * same `key` — so a drag handler can call this on every frame without
   * tracking gesture lifecycle itself.
   *
   * A gesture under a *different* key commits the open one first: starting
   * to rename a node while a drag is somehow still open means the drag
   * finished, not that the two interleave.
   */
  beginGesture(options: { key: string; label: string }): Gesture<S, E> {
    const current = this.#gesture;
    if (current?.open) {
      if (current.key === options.key) return this.#gestureHandle(current);
      this.#closeGesture();
    }
    const gesture: OpenGesture<S, E> = {
      key: options.key,
      label: options.label,
      inverses: [],
      updates: [],
      edits: [],
      open: true,
    };
    this.#gesture = gesture;
    return this.#gestureHandle(gesture);
  }

  /**
   * Undoes the most recent entry by applying its inverse as a forward
   * command (ADR-0005). Returns false when there's nothing to undo.
   *
   * An open gesture commits first, so Cmd+Z mid-drag undoes the drag rather
   * than reaching behind it.
   */
  undo(): boolean {
    this.#closeGesture();
    const entry = this.#undoable.pop();
    if (!entry) return false;
    const applied = entry.reverse.apply(this.#state);
    this.#push(this.#redoable, { label: entry.label, reverse: applied.inverse });
    // An undo reaches `dispatch` with *its* edits — the inverse's own
    // description of itself — so whatever persists edits sees an ordinary
    // one and has a single path to maintain (ADR-0005, #103).
    this.#commit(applied.state, entry.reverse, applied.edits ?? []);
    return true;
  }

  /** Reapplies the most recently undone entry. False if there's none. */
  redo(): boolean {
    this.#closeGesture();
    const entry = this.#redoable.pop();
    if (!entry) return false;
    const applied = entry.reverse.apply(this.#state);
    this.#push(this.#undoable, { label: entry.label, reverse: applied.inverse });
    this.#commit(applied.state, entry.reverse, applied.edits ?? []);
    return true;
  }

  /**
   * Replaces the state and forgets all history — the graph arriving fresh
   * from the server, or a different Show being opened. History is not
   * rebased onto new state, because an inverse captured against the old
   * state has no honest meaning against the new one.
   */
  reset(state: S = this.#state): void {
    this.#gesture = null;
    this.#undoable = [];
    this.#redoable = [];
    this.#state = state;
    this.#onChange?.(state);
  }

  #gestureHandle(gesture: OpenGesture<S, E>): Gesture<S, E> {
    return {
      key: gesture.key,
      label: gesture.label,
      get isOpen() {
        return gesture.open;
      },
      get isEmpty() {
        return gesture.updates.length === 0;
      },
      update: (command) => this.#updateGesture(gesture, command),
      commit: () => this.#commitGesture(gesture),
      abort: () => this.#abortGesture(gesture),
    };
  }

  #updateGesture(gesture: OpenGesture<S, E>, command: Command<S, E>): S {
    if (!gesture.open) {
      throw new Error(`Gesture "${gesture.key}" has already ended.`);
    }
    if (command.isEmpty) return this.#state;
    const applied = command.apply(this.#state);
    // A frame that changed nothing — a drag that hasn't left the pixel it
    // started on — isn't recorded, so a gesture made entirely of those
    // commits to nothing rather than to an empty entry.
    if (applied.inverse.isEmpty) return this.#state;
    gesture.updates.push(command);
    gesture.inverses.push(applied.inverse);
    gesture.edits.push(...(applied.edits ?? []));
    this.#state = applied.state;
    // Mid-gesture states are shown, not dispatched: the server hears about
    // the gesture once, when it commits (#28).
    this.#onChange?.(applied.state);
    return applied.state;
  }

  #commitGesture(gesture: OpenGesture<S, E>): boolean {
    if (!gesture.open) return false;
    gesture.open = false;
    if (this.#gesture === gesture) this.#gesture = null;
    if (gesture.updates.length === 0) return false;

    const forward = composite({ label: gesture.label, commands: gesture.updates });
    const reverse = composite({
      label: gesture.label,
      commands: [...gesture.inverses].reverse(),
    });
    this.#redoable = [];
    this.#push(this.#undoable, { label: gesture.label, reverse });
    // The state is already where the updates left it — committing lands the
    // entry, it doesn't re-apply the work.
    // Every frame's edits, not just the last frame's: a drag ended where it
    // did by way of all of them, and the server is told the whole run at
    // once — but it is told all of it.
    this.#dispatch?.(forward, this.#state, gesture.edits);
    return true;
  }

  #abortGesture(gesture: OpenGesture<S, E>): S {
    if (!gesture.open) return this.#state;
    gesture.open = false;
    if (this.#gesture === gesture) this.#gesture = null;
    let next = this.#state;
    for (const inverse of [...gesture.inverses].reverse()) {
      next = inverse.apply(next).state;
    }
    this.#state = next;
    this.#onChange?.(next);
    return next;
  }

  /** Ends any open gesture as if the user had finished it. */
  #closeGesture(): void {
    const gesture = this.#gesture;
    if (gesture?.open) this.#commitGesture(gesture);
  }

  #push(stack: StackEntry<S, E>[], entry: StackEntry<S, E>): void {
    stack.push(entry);
    if (stack.length > this.#limit) stack.splice(0, stack.length - this.#limit);
  }

  #commit(state: S, dispatched: Command<S, E>, edits: readonly E[]): S {
    this.#state = state;
    this.#onChange?.(state);
    this.#dispatch?.(dispatched, state, edits);
    return state;
  }
}
