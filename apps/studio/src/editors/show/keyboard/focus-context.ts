// Reading where keyboard focus is, for the editor's window-level key
// handlers (issues #40, #41).
//
// Extracted from ./use-viewport-keys when undo/redo arrived, because both
// handlers need the same answer and neither should be the one that owns it:
// two copies of "is the user typing?" is exactly how one of them ends up
// stealing Cmd+Z from a rename field.

/**
 * Roles whose owner is already using the keyboard. `.react-flow__node`
 * isn't here because a focused node is a *separate* fact — panning defers to
 * it, zooming and undo don't (see `FocusContext`).
 *
 * Include buttons and common interactive ARIA roles: inspector toggles and
 * alignment controls are buttons, not text fields, but their arrow keys still
 * belong to the focused control rather than the canvas.
 */
const KEY_CONSUMING_SELECTOR =
  'button, input, textarea, select, [contenteditable], [role="menu"], [role="listbox"], [role="dialog"], [role="combobox"], [role="button"], [role="checkbox"], [role="radio"], [role="slider"], [role="spinbutton"], [role="tab"]';
const CANVAS_PANEL_SELECTOR = '[aria-label="Layers"], [aria-label="Properties"]';
const TEXT_INPUT_SELECTOR = "input, textarea, select, [contenteditable]";
const UNDO_BLOCKING_SELECTOR =
  '[role="menu"], [role="listbox"], [role="dialog"], [role="combobox"]';
export interface DomFocusContext {
  nodeHasFocus: boolean;
  inKeyConsumingWidget: boolean;
  inCanvasPanel: boolean;
  inTextInput: boolean;
  inUndoBlockingWidget: boolean;
}

export function focusContext(): DomFocusContext {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) {
    return {
      nodeHasFocus: false,
      inKeyConsumingWidget: false,
      inCanvasPanel: false,
      inTextInput: false,
      inUndoBlockingWidget: false,
    };
  }
  return {
    nodeHasFocus: active.closest(".react-flow__node") !== null,
    inKeyConsumingWidget: active.closest(KEY_CONSUMING_SELECTOR) !== null,
    inCanvasPanel: active.closest(CANVAS_PANEL_SELECTOR) !== null,
    inTextInput: active.closest(TEXT_INPUT_SELECTOR) !== null,
    inUndoBlockingWidget: active.closest(UNDO_BLOCKING_SELECTOR) !== null,
  };
}
