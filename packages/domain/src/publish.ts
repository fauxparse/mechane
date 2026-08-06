// What the editor chrome says about a Show's draft (issue #39): the badge
// beside the Show name, and whether Publish has anything to do.
//
// ADR-0002 makes draft and published two independently readable states of
// the same graph, and publishing a snapshot of the draft — so "are there
// unpublished changes?" isn't stored anywhere. It's derived by comparing
// the two graphs' timestamps, which is what this module does, once, for
// every consumer.
//
// `readShowGraph` (apps/api/src/db/show-graph.ts) reports a graph that was
// never written as the epoch, so an untouched Show reads as
// epoch/epoch — which is "nothing has happened yet", not "the draft is
// ahead". That distinction is the whole reason this is three states rather
// than a boolean.

/** How a Show's draft stands relative to what its Devices are showing. */
export type PublishState =
  /** Never edited and never published — an empty Show. */
  | "empty"
  /** The draft has moved on since the last publish (or was never published). */
  | "unpublished-changes"
  /** Published, and untouched since. */
  | "published";

const NEVER = new Date(0).getTime();

function timestamp(value: string | Date): number {
  const time = (value instanceof Date ? value : new Date(value)).getTime();
  // An unparseable timestamp is treated as "never": the badge degrades to
  // "Draft" rather than throwing on the way to painting the chrome.
  return Number.isNaN(time) ? NEVER : time;
}

/**
 * The publish state of a Show, from the `updatedAt` of its draft and
 * published graphs.
 *
 * Publishing writes the published graph *after* reading the draft, so a
 * freshly published Show has `published >= draft` — equality counts as
 * published, not as pending changes.
 */
export function publishState(
  draftUpdatedAt: string | Date,
  publishedUpdatedAt: string | Date,
): PublishState {
  const draft = timestamp(draftUpdatedAt);
  const published = timestamp(publishedUpdatedAt);
  if (draft === NEVER && published === NEVER) return "empty";
  return draft > published ? "unpublished-changes" : "published";
}

/** Whether publishing would change what connected Devices are showing. */
export function hasUnpublishedChanges(state: PublishState): boolean {
  return state === "unpublished-changes";
}
