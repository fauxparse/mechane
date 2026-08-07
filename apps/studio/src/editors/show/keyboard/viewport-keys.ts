// Keyboard viewport navigation for the Show editor (issue #40, spec'd by
// #21): arrow keys pan the camera, `+`/`-` (and Cmd+/Cmd-) zoom.
//
// "Canvas" is deliberately absent from this whole directory: in Mechanē's
// vocabulary a Canvas is the element tree a Scene owns (/CONTEXT.md), which
// is the *other* editor. This one edits the Show graph.
//
// PRD §6.3 allows exactly one keyboard exception — creating an edge — so
// viewport navigation is *built*, not exempted. React Flow v11 ships no
// keyboard viewport handling of its own; `useReactFlow()`'s imperative
// viewport API is the seam, and this module is the decision layer above it.
//
// Deliberately pure and DOM-free: a key press plus two facts about where
// focus currently is maps to an *intent*, and the hook that owns the
// listener is the only thing that touches React Flow. That's what makes
// "arrow keys pan only when no node holds focus" a unit test rather than a
// thing to click through.

/**
 * What a key press asks of the camera. Pan deltas are in **screen pixels**,
 * not flow coordinates, so a key press moves the view the same visible
 * distance whether the director is zoomed right out or right in.
 *
 * `dx`/`dy` are the direction the *camera* travels: `ArrowRight` gives a
 * positive `dx`, which reveals content further to the right.
 */
export type ViewportIntent =
  | { type: "pan"; dx: number; dy: number }
  | { type: "zoom"; direction: "in" | "out" };

/** The parts of a `KeyboardEvent` this decision needs. */
export interface KeyChord {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

/**
 * Where keyboard focus is sitting. Both answers change what a key press
 * means, and neither is knowable from the event alone.
 */
export interface FocusContext {
  /**
   * A graph node holds focus. React Flow already moves a focused node with
   * the arrow keys (this is the very behaviour that let PRD §6.3 drop its
   * node-dragging exception), so the camera must not also move — otherwise
   * one key press does two things.
   */
  nodeHasFocus: boolean;
  /**
   * Focus is inside something that already owns the keyboard — a text
   * field, an open menu, a listbox, a dialog. The editor chrome's inline
   * rename field and Show-name menu (#39) both sit over the graph, so this
   * isn't hypothetical: without it, typing a Show's name would fly the
   * camera around behind the input.
   */
  inKeyConsumingWidget: boolean;
}

/** One arrow press. Roughly a third of a node width. */
export const PAN_STEP = 72;

/** One arrow press with Shift — for crossing a big graph without holding a key down. */
export const PAN_STEP_LARGE = 360;

const PAN_KEYS: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

// `=` and `_` are the unshifted faces of the `+` and `-` keys: requiring a
// literal `+` would mean requiring Shift on most layouts, which nobody does.
const ZOOM_IN_KEYS = new Set(["+", "="]);
const ZOOM_OUT_KEYS = new Set(["-", "_"]);

/**
 * The camera movement `chord` asks for, or null if it asks for nothing —
 * in which case the caller must leave the event alone.
 *
 * Cmd+/Cmd- (and Ctrl+/Ctrl-) are claimed on purpose: they're the browser's
 * page-zoom shortcuts, and inside a full-screen graph editor the zoom a user
 * means is the graph's. The caller preventDefaults whenever an intent comes
 * back, which is what makes that stick.
 */
export function viewportIntentFor(chord: KeyChord, focus: FocusContext): ViewportIntent | null {
  if (focus.inKeyConsumingWidget) return null;
  // Alt is left for other bindings; a modified arrow shouldn't quietly pan.
  if (chord.altKey) return null;

  if (ZOOM_IN_KEYS.has(chord.key)) return { type: "zoom", direction: "in" };
  if (ZOOM_OUT_KEYS.has(chord.key)) return { type: "zoom", direction: "out" };

  const direction = PAN_KEYS[chord.key];
  if (!direction) return null;
  // Zoom is a camera-only concern, so it fires whatever holds focus; panning
  // is the half that collides with a focused node's own arrow-key movement.
  if (focus.nodeHasFocus) return null;
  if (chord.metaKey || chord.ctrlKey) return null;

  const step = chord.shiftKey ? PAN_STEP_LARGE : PAN_STEP;
  return { type: "pan", dx: direction.x * step, dy: direction.y * step };
}
