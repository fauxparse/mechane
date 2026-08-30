// The DOM half of the editor's keybinding table (issue #42), the sibling of
// ./use-viewport-keys and ./use-undo-keys: read where focus is, ask
// ./editor-keys what the press means, and call the matching action.
//
// Three hooks rather than one because the three tables have different owners
// (#21's camera, ADR-0005's undo, #37's commands) and each is decided in its
// own pure module. They compose because none of them claims a key another one
// owns — which is a property the tests of those modules check.
import { useEffect } from "react";

import { editorIntentFor } from "./editor-keys";
import type { EditorIntent } from "./editor-keys";
import { focusContext } from "./focus-context";

export type EditorKeyActions = {
  [intent in EditorIntent]: () => void;
};

/**
 * Binds #37's command keys to `actions`.
 *
 * On `window` for the same reason the other two are: these have to work when
 * nothing in particular is focused, which is the state the editor opens in.
 */
export function useEditorKeys(
  actions: EditorKeyActions,
  options: { allowCanvasPanelCommands?: boolean } = {},
): void {
  const allowCanvasPanelCommands = options.allowCanvasPanelCommands ?? false;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const focus = focusContext();
      const panelCommand =
        allowCanvasPanelCommands &&
        focus.inCanvasPanel &&
        !focus.inTextInput &&
        !focus.inUndoBlockingWidget &&
        (event.metaKey || event.ctrlKey);
      const intent = editorIntentFor(
        event,
        panelCommand ? { ...focus, inKeyConsumingWidget: false } : focus,
      );
      if (!intent) return;
      // Claimed: Backspace would otherwise navigate back in some browsers, and
      // Mod+A would select the page's text rather than the graph's nodes.
      event.preventDefault();
      actions[intent]();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions, allowCanvasPanelCommands]);
}
