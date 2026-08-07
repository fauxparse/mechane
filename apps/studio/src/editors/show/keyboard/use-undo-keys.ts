// The DOM half of undo/redo's keyboard binding (issue #41), the sibling of
// ./use-viewport-keys: read where focus is, ask ./undo-keys what the press
// means, and move the stack. All of the deciding lives next door in a pure
// module with tests.
import { useEffect } from "react";

import { focusContext } from "./focus-context";
import { undoIntentFor } from "./undo-keys";

/**
 * Binds Cmd+Z / Shift+Cmd+Z (and their Ctrl equivalents) to the editor's
 * command stack.
 *
 * The listener is on `window` for the same reason the viewport's is: undo has
 * to work when nothing in particular is focused, which is the state the
 * editor opens in. `undoIntentFor` is what keeps it out of a text field's
 * own undo.
 */
export function useUndoKeys({ undo, redo }: { undo(): void; redo(): void }): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const intent = undoIntentFor(event, focusContext());
      if (!intent) return;
      // Claimed: the browser's own undo would otherwise also fire, and in an
      // editor the undo the user means is the graph's.
      event.preventDefault();
      if (intent === "undo") undo();
      else redo();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);
}
