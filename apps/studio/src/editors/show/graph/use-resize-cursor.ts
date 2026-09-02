// Holds the resize cursor for the length of a Flow resize (#508).
//
// React Flow puts the right cursor on each resize control — `ns-resize` on the
// bottom edge, `nwse-resize` on a corner — but a control is a few pixels wide,
// and the pointer leaves it the moment the drag starts. From then on the
// cursor is whatever it happens to be over: a node, a handle, the pane. The
// control's own cursor is the honest one for the whole gesture, so it is read
// at pointerdown and pinned to the document until release.
//
// Pinned via a data attribute and a custom property rather than an inline
// style, because `body { cursor }` loses to every element that sets its own —
// see the `!important` rule in ./show-graph-editor.css.
import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

const RESIZE_CONTROL = ".react-flow__resize-control";

/** Set on `<body>`; the CSS rule keys off it. */
const RESIZING_ATTRIBUTE = "mechaneResizing";

const CURSOR_VARIABLE = "--mechane-resize-cursor";

/**
 * Returns a `pointerdown` handler to put on the Flow node. It does nothing
 * unless the press landed on a resize control, so it is safe on the whole
 * node rather than needing to reach inside React Flow's own markup.
 */
export function useResizeCursor(): (event: ReactPointerEvent) => void {
  const holding = useRef(false);

  const release = useCallback(() => {
    if (!holding.current) return;
    holding.current = false;
    delete document.body.dataset[RESIZING_ATTRIBUTE];
    document.body.style.removeProperty(CURSOR_VARIABLE);
  }, []);

  // A Flow deleted or collapsed mid-drag would otherwise leave the cursor
  // pinned with nothing left to release it.
  useEffect(() => release, [release]);

  return useCallback(
    (event: ReactPointerEvent) => {
      const control = event.target instanceof Element ? event.target.closest(RESIZE_CONTROL) : null;
      if (!control) return;
      const { cursor } = window.getComputedStyle(control);
      if (!cursor || cursor === "auto") return;

      holding.current = true;
      document.body.dataset[RESIZING_ATTRIBUTE] = "";
      document.body.style.setProperty(CURSOR_VARIABLE, cursor);
      window.addEventListener("pointerup", release, { once: true });
      window.addEventListener("pointercancel", release, { once: true });
    },
    [release],
  );
}
