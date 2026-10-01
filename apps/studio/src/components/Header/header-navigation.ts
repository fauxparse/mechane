// What a click on one of the Header's navigation controls should do.
//
// Pure, like the editors' keybinding tables: a click's shape maps to an
// *intent*, and `followHeaderLink` does the rest. That's what makes "cmd-click
// still opens a new tab" a unit test.
//
// The Header's destinations render as real anchors inside Base UI's `Tabs.Tab`
// and `DropdownMenu.Item`, so they work as links (middle click, "Copy link").
// Base UI does not stop an anchor's default action, so a plain click has to
// call `preventDefault()` itself. Without it the browser follows the href after
// the client-side navigation: a full page load inside the same Show, which asks
// "Leave site?" whenever a Run is live (see ../LastWindowRun).
import type { MouseEvent } from "react";

import type { HeaderDestination } from "./Header";

/** Where a click should be handled. */
export type NavigationIntent =
  /** Navigate in place, client-side. */
  | "navigate"
  /** Open the destination in a new tab. */
  | "new-tab"
  /** Not ours: leave it to the browser. */
  | "ignore";

/** The parts of a mouse event this decision depends on. */
export interface Activation {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function navigationIntentFor({
  button,
  metaKey,
  ctrlKey,
  shiftKey,
  altKey,
}: Activation): NavigationIntent {
  // Middle and right clicks arrive as `auxclick`/`contextmenu` on the anchor,
  // which Base UI leaves alone, so the browser still handles them correctly.
  if (button !== 0) return "ignore";
  // Alt-click means "download this" on most platforms, which is not ours to
  // reinterpret as navigation.
  if (altKey) return "ignore";
  if (metaKey || ctrlKey || shiftKey) return "new-tab";
  return "navigate";
}

/** The click handler for one of the Header's destination anchors. */
export function followHeaderLink(destination: HeaderDestination) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    switch (navigationIntentFor(event)) {
      case "navigate":
        event.preventDefault();
        destination.onSelect();
        return;
      case "new-tab":
        window.open(destination.href, "_blank", "noopener");
        return;
      case "ignore":
        return;
    }
  };
}
