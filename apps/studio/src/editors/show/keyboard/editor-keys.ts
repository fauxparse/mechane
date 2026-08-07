// The Show editor's keybinding table (issue #42, decided by #37).
//
// Pure, like ./viewport-keys and ./undo-keys: a chord plus where focus is maps
// to an *intent*, and the hook that owns the listener does the rest. That's
// what makes "F2 doesn't fire while the inspector holds focus" a unit test.
//
// #37's organising principle is palette-first: every command is reachable
// through Cmd+K, and a dedicated binding is an optimisation granted only to
// frequent operations. So this table is deliberately short — move into Flow, move out of Flow,
// and collapse have no keys at all and live in the palette only.
//
// The bindings #37 settled, and who owns each:
//
//   Mod+K            open the palette                    here
//   Mod+Z / Shift    undo / redo                         ./undo-keys
//   Backspace/Delete delete the selection                here
//   F2               rename the focused node inline      here
//   Mod+A            select all                          here
//   Shift+1 / 2      fit whole Show / zoom to selection  here
//   Escape           deselect, or cancel a rename        here
//   Tab, Enter, ↑↓←→ focus, select, move                 React Flow's own
//   + / - / Mod+=    zoom                                ./viewport-keys
//
// Escape and Backspace are React Flow's too, but its own handlers are turned
// off in the editor (`deleteKeyCode={null}`) so a delete can go through a
// Command and confirm first — which means they're listed here.

import type { FocusContext, KeyChord } from "./viewport-keys";

/** What a press asks the editor to do. */
export type EditorIntent =
  | "open-palette"
  | "delete-selection"
  | "rename"
  | "select-all"
  | "fit-graph"
  | "zoom-to-selection"
  | "deselect";

/**
 * The editor action `chord` asks for, or null if it asks for nothing — in
 * which case the caller must leave the event alone.
 *
 * Two rules, both from #37's scoping section:
 *
 *   - Nothing but the palette fires while focus is in a text field or an open
 *     menu. React Flow's own `isInputDOMNode` suppression covers *its* keys,
 *     not ones added here, so `Mod+A` selecting the whole graph while renaming
 *     a node has to be prevented explicitly.
 *   - **Cmd+K is the exception**: the palette is the universal surface, and a
 *     director who has started typing a name should still be able to reach it.
 */
export function editorIntentFor(chord: KeyChord, focus: FocusContext): EditorIntent | null {
  const commandKey = Boolean(chord.metaKey) !== Boolean(chord.ctrlKey);
  const key = chord.key.toLowerCase();

  if (commandKey && key === "k" && !chord.shiftKey && !chord.altKey) return "open-palette";
  if (focus.inKeyConsumingWidget) return null;
  if (chord.altKey) return null;

  if (commandKey) {
    if (key === "a" && !chord.shiftKey) return "select-all";
    return null;
  }

  // Figma's framing bindings (#37) — PRD §6.1 calls the Canvas editor
  // "Figma-lite", so borrowing them costs nothing and buys familiarity.
  if (chord.shiftKey && chord.key === "!") return "fit-graph";
  if (chord.shiftKey && chord.key === "@") return "zoom-to-selection";
  // Reported unshifted on layouts where Shift+1 isn't `!`.
  if (chord.shiftKey && chord.key === "1") return "fit-graph";
  if (chord.shiftKey && chord.key === "2") return "zoom-to-selection";
  if (chord.shiftKey) return null;

  if (chord.key === "Backspace" || chord.key === "Delete") return "delete-selection";
  // Rename is F2, not Enter: Enter is already React Flow's "select the focused
  // element", and #36 kept its keyboard a11y wholesale (#37).
  if (chord.key === "F2") return "rename";
  if (chord.key === "Escape") return "deselect";
  return null;
}
