// What a key press means to the undo stack (issue #41, PRD §6.3).
//
// Pure and DOM-free, for the same reason ./viewport-keys is: "Cmd+Z does not
// undo the graph while you're typing in the rename field" is a rule worth a
// unit test, not a thing to click through. The hook next door
// (./use-undo-keys) owns the listener and reads focus.
//
// Undo/redo is `global` scope in #37's taxonomy — the one editor-wide
// binding that doesn't need the graph focused or anything selected.

import type { FocusContext, KeyChord } from "./viewport-keys";

/** Which direction along the stack a press asks for. */
export type UndoIntent = "undo" | "redo";

/**
 * The stack movement `chord` asks for, or null if it asks for nothing — in
 * which case the caller must leave the event alone.
 *
 * The bindings, and why:
 *
 *   - **Cmd+Z / Ctrl+Z** undo, **Shift+Cmd+Z / Shift+Ctrl+Z** redo: the Mac
 *     convention and the one Figma uses, which is the interaction model the
 *     editors are modelled on (PRD §6.1).
 *   - **Ctrl+Y** also redoes, for Windows hands. Cmd+Y is deliberately not
 *     bound — on macOS it isn't redo anywhere.
 *   - Alt is unbound: a modified chord shouldn't quietly undo.
 *
 * Nothing fires while focus is in a text field or an open menu. A rename
 * field's own Cmd+Z is the *browser's* undo of the text being typed, and
 * that's what the user means — reaching past it to revert a graph edit
 * would be actively wrong, not merely surprising.
 */
export function undoIntentFor(chord: KeyChord, focus: FocusContext): UndoIntent | null {
  if (
    focus.inUndoBlockingWidget ||
    (focus.inKeyConsumingWidget && (!focus.inCanvasPanel || focus.inTextInput))
  )
    return null;
  if (chord.altKey) return null;
  // Exactly one of the two command modifiers, so Cmd+Ctrl+Z is left alone.
  const commandKey = Boolean(chord.metaKey) !== Boolean(chord.ctrlKey);
  if (!commandKey) return null;

  const key = chord.key.toLowerCase();
  if (key === "z") return chord.shiftKey ? "redo" : "undo";
  // Windows' other redo. Shift+Ctrl+Y isn't a binding anywhere.
  if (key === "y" && chord.ctrlKey && !chord.shiftKey) return "redo";
  return null;
}
