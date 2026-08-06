// What a Command *is* (issue #41, PRD §6.3, spec'd by #28 and ADR-0005).
//
// One rule shapes everything below: **a command produces its own inverse at
// the moment it is applied.** Not "a command knows how to undo itself
// later" — later is too late. By the time a delete has happened, the node
// data, its position, and every edge that touched it are gone, and nothing
// can reconstruct them (#28). So `apply` hands back both the next state and
// the command that reverses it, built while the old state was still in hand.
//
// That single decision covers three of #28's requirements at once:
//
//   - **Snapshot-carrying deletes**: the snapshot is whatever the inverse
//     closed over. There's no separate snapshot concept to keep in sync.
//   - **Undo as a forward command** (ADR-0005): the inverse is an ordinary
//     `Command`, indistinguishable from one the user typed, so undo takes
//     exactly the same path to the server as any other edit.
//   - **Redo for free**: applying an inverse yields *its* inverse, which is
//     the redo command. Nothing special-cases the direction of travel.
//
// Commands are pure functions of state, not mutators: `apply` returns a new
// state and never touches the one it was given. That's what lets the stack
// (./stack) hold onto previous states, and what makes every rule here a
// unit test rather than a thing to click through.
//
// Deliberately absent: keybindings, palette entries, and any DOM. A command
// declares its `scope` (#37) and the surfaces that trigger commands read it;
// nothing in this package listens to a keyboard.

/**
 * When a command is allowed to fire (#37). A binding or palette entry does
 * not fire unless its scope is active — a field on the command rather than
 * a condition scattered across handlers, and the same taxonomy the palette
 * groups by, so there is one list and not two.
 *
 * This package only *declares* the scope; the editor surfaces enforce it.
 */
export const COMMAND_SCOPES = [
  /** Always available: undo/redo, the palette itself, Show-level actions. */
  "global",
  /** The graph surface has focus: select-all, fit, zoom, node creation. */
  "canvas",
  /** Acts on the current selection: delete, rename, promote, extract. */
  "selection",
] as const;

export type CommandScope = (typeof COMMAND_SCOPES)[number];

/** The result of applying a command: the new state, and the way back. */
export interface AppliedCommand<S> {
  readonly state: S;
  /**
   * A command that returns the state to what it was before this one ran.
   * An ordinary forward command (ADR-0005) — applying it yields *its*
   * inverse, which is how redo works.
   */
  readonly inverse: Command<S>;
}

/**
 * One user-meaningful mutation of `S`.
 *
 * `label` is what the user sees ("Move node", "Delete Flow"), and is what
 * the undo stack reports for its next undo/redo — so it reads as a
 * description of the *edit*, not of the direction.
 */
export interface Command<S> {
  readonly type: string;
  readonly label: string;
  readonly scope: CommandScope;
  /**
   * True for a command that changes nothing — an empty composite, or the
   * inverse of a move that went nowhere. The stack drops these rather than
   * parking a no-op entry the user has to press Cmd+Z twice to get past.
   *
   * Some commands can only know this once they've seen the state (a move to
   * where the node already is), so the honest signal is *an empty inverse*
   * coming back from `apply` — nothing was displaced, so there is nothing
   * to reverse. That's what the stack tests.
   */
  readonly isEmpty: boolean;
  apply(state: S): AppliedCommand<S>;
}

export interface CommandSpec<S> {
  type: string;
  label: string;
  scope: CommandScope;
  isEmpty?: boolean;
  apply(state: S): AppliedCommand<S>;
}

/**
 * The low-level constructor: a command whose `apply` builds its own inverse.
 * Reach for `capturing` instead unless the inverse genuinely can't be
 * expressed as "restore what I captured".
 */
export function defineCommand<S>(spec: CommandSpec<S>): Command<S> {
  return {
    type: spec.type,
    label: spec.label,
    scope: spec.scope,
    isEmpty: spec.isEmpty ?? false,
    apply: spec.apply,
  };
}

export interface CapturingSpec<S, C> {
  type: string;
  label: string;
  scope: CommandScope;
  /**
   * The part of the state this command is about to change, captured
   * *before* it changes. Everything the inverse will need must come out of
   * here — for a delete, that means the node, its position, and every edge
   * removed with it, because after `apply` they don't exist (#28).
   *
   * Capture by value. A capture that aliases live state is a capture of
   * nothing.
   */
  capture(state: S): C;
  /** The forward change. Must not mutate `state`. */
  apply(state: S): S;
  /** Puts `captured` back. Must not mutate `state`. */
  restore(state: S, captured: C): S;
  /**
   * Whether the capture is worth an undo entry at all — `false` means
   * "this changes nothing", e.g. moving a node to where it already is.
   */
  isEmpty?(state: S, captured: C): boolean;
}

/**
 * A command that changes nothing, and reverses to itself. What a command
 * hands back as its inverse when it turned out to have nothing to do.
 */
export function noop<S>(label = "Nothing to do", scope: CommandScope = "global"): Command<S> {
  const command: Command<S> = {
    type: "noop",
    label,
    scope,
    isEmpty: true,
    apply: (state) => ({ state, inverse: command }),
  };
  return command;
}

/**
 * A command whose inverse restores what it captured on the way past.
 *
 * This is the shape almost every real command has, including all of #28's
 * awkward cases:
 *
 *   - a move captures the old position;
 *   - a rename captures the old name;
 *   - a delete captures the whole destroyed thing — node, position, edges,
 *     and any side effect the delete had on its neighbours.
 *
 * The inverse is itself a capturing command over the same `capture`/
 * `restore` pair, so undo → redo → undo can run indefinitely and each hop
 * captures the state it actually found.
 */
export function capturing<S, C>(spec: CapturingSpec<S, C>): Command<S> {
  return defineCommand<S>({
    type: spec.type,
    label: spec.label,
    scope: spec.scope,
    apply(state) {
      const captured = spec.capture(state);
      // Nothing displaced, nothing to reverse — and the stack reads that
      // empty inverse as "don't land an entry for this".
      if (spec.isEmpty?.(state, captured)) return { state, inverse: noop(spec.label, spec.scope) };
      return {
        state: spec.apply(state),
        inverse: restoring(spec, captured),
      };
    },
  });
}

/**
 * The inverse half of `capturing`: put `captured` back.
 *
 * Its own inverse — the redo command — is the *forward* command again, not
 * another restore. That distinction only shows up for commands expressed as
 * a delta rather than as a value ("nudge by 4px", "append an item"), where
 * restoring twice would walk backwards twice instead of returning. So undo
 * and redo alternate between `restore` and `apply`, which is right for both
 * shapes.
 */
function restoring<S, C>(spec: CapturingSpec<S, C>, captured: C): Command<S> {
  return defineCommand<S>({
    type: spec.type,
    label: spec.label,
    scope: spec.scope,
    apply: (state) => ({
      state: spec.restore(state, captured),
      // Recaptures when it runs, so a redo carries what *it* displaced.
      inverse: capturing(spec),
    }),
  });
}

export interface CompositeSpec<S> {
  type?: string;
  label: string;
  /** Defaults to the scope of the first part; `global` when there are none. */
  scope?: CommandScope;
  commands: readonly Command<S>[];
}

/**
 * Several commands that are **one** edit — one undo entry, one Cmd+Z (#28).
 *
 * This is what makes a cascading delete a single stack entry: deleting a
 * Flow is a composite of "remove this Scene", "remove that edge", "remove
 * the Flow", and undoing it restores the whole destroyed subtree in one
 * press, never N. It is also how a command's *side effects* stay welded to
 * it — a promote that auto-assigns a Flow's default Scene is the membership
 * change and the assignment in one composite, so one undo reverts both
 * (#28).
 *
 * Parts apply in order; the inverse applies their inverses in reverse
 * order, which is what makes "remove children, then remove the parent"
 * invert to "restore the parent, then its children".
 */
export function composite<S>(spec: CompositeSpec<S>): Command<S> {
  const parts = spec.commands.filter((command) => !command.isEmpty);
  const scope = spec.scope ?? parts[0]?.scope ?? "global";
  return defineCommand<S>({
    type: spec.type ?? "composite",
    label: spec.label,
    scope,
    isEmpty: parts.length === 0,
    apply(state) {
      const inverses: Command<S>[] = [];
      let next = state;
      for (const part of parts) {
        const applied = part.apply(next);
        next = applied.state;
        inverses.push(applied.inverse);
      }
      return {
        state: next,
        inverse: composite({
          type: spec.type ?? "composite",
          label: spec.label,
          scope,
          commands: inverses.reverse(),
        }),
      };
    },
  });
}
