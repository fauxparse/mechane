// What a click on one of the Header's navigation controls should do.
//
// Pure, like the editors' keybinding tables: a click's shape maps to an
// *intent*, and the component does the rest. That's what makes "cmd-click still
// opens a new tab" a unit test.
//
// The subtlety this module exists to record: the Header's destinations render as
// anchors inside Base UI's `Tabs.Tab` and `DropdownMenu.Item`, **both of which
// call `preventDefault()` when they activate**. So two things that look obvious
// are wrong here:
//
//   - Skipping our own handling when `event.defaultPrevented` is set. Base UI has
//     already set it by the time our handler runs, so the guard fires on every
//     click and nothing ever navigates.
//   - Returning early on a modified click and trusting the browser to follow the
//     href. It will not — the default is already prevented — so a cmd-click has
//     to be opened explicitly.

/** Where a click should be handled. */
export type NavigationIntent =
  /** Navigate in place, client-side. */
  | "navigate"
  /** Open the destination in a new tab, because the browser will not. */
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
