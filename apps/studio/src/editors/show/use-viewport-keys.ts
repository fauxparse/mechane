// The DOM half of keyboard viewport navigation (issue #40): read where
// focus is, ask ./viewport-keys what the press means, and drive React Flow's
// imperative viewport API. All of the *deciding* lives next door, in a pure
// module with tests; this file is the wiring, and stays boring on purpose.
import { useEffect } from "react";
import { useReactFlow } from "reactflow";

import { viewportIntentFor } from "./viewport-keys";

/**
 * How long the camera takes to settle, so a single key press reads as
 * movement rather than a jump cut.
 *
 * Held keys get none of it: an autorepeating key fires faster than the
 * transition finishes, and each new animation starting from a half-finished
 * one makes holding an arrow down feel like wading. Instant steps at repeat
 * rate read as smooth continuous motion, which is what holding a key means.
 */
const TRANSITION_MS = 120;

/**
 * Roles whose owner is already using the arrow keys. `.react-flow__node`
 * isn't here because a focused node is a *separate* fact — panning defers to
 * it, zooming doesn't (see `FocusContext`).
 */
const KEY_CONSUMING_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"], [role="dialog"], [role="combobox"]';

function focusContext() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) {
    return { nodeHasFocus: false, inKeyConsumingWidget: false };
  }
  return {
    nodeHasFocus: active.closest(".react-flow__node") !== null,
    inKeyConsumingWidget: active.closest(KEY_CONSUMING_SELECTOR) !== null,
  };
}

/**
 * Binds arrow-key panning and `+`/`-` zooming to the enclosing React Flow
 * instance. Must be called inside a `<ReactFlowProvider>`.
 *
 * The listener is on `window` rather than the graph wrapper because the
 * camera should answer to the arrow keys when *nothing* is focused, which is
 * the state the editor is in when it opens — a wrapper-scoped listener would
 * mean pressing Tab first to get a camera you can steer. The cost is that
 * the guard has to be explicit, which is what `focusContext` above is for.
 */
export function useViewportKeys(): void {
  const { getViewport, setViewport, zoomIn, zoomOut } = useReactFlow();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const intent = viewportIntentFor(event, focusContext());
      if (!intent) return;
      // Claimed: stops the page scrolling on arrows and the *browser* zooming
      // on Cmd+/Cmd-.
      event.preventDefault();
      const duration = event.repeat ? 0 : TRANSITION_MS;

      if (intent.type === "zoom") {
        // React Flow's own zoom, so `minZoom`/`maxZoom` are enforced in one
        // place rather than re-clamped here.
        if (intent.direction === "in") zoomIn({ duration });
        else zoomOut({ duration });
        return;
      }

      // The viewport translate is where the *content* sits, so moving the
      // camera right means moving the content left — hence the subtraction.
      // Screen-space deltas need no zoom scaling, which is the point of them.
      const viewport = getViewport();
      setViewport(
        { ...viewport, x: viewport.x - intent.dx, y: viewport.y - intent.dy },
        { duration },
      );
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [getViewport, setViewport, zoomIn, zoomOut]);
}
