// The Run error log (issue #459) — the operator-facing audit trail for
// configuration failures a live Show hits at runtime.
//
// This is deliberately *not* the Event ledger. `player_events` records what
// each submitted Event did so a retried Event is idempotent; it says nothing
// about a Show whose persisted configuration cannot be executed at all. It is
// also deliberately not crash telemetry: every category below is a failure in
// the *user's* Show — a Scene with no Canvas, a Device belonging to no Flow, a
// Cue leading nowhere — which the director or technician can act on, not a bug
// in our code that they can't. Genuinely unexpected exceptions stay unexpected
// exceptions; the taxonomy here is closed on purpose.
//
// Two consequences of "the reader is the operator" run through this module:
//
//   * A Run Error carries a stable category plus identifiers, never a captured
//     exception message or request payload. Prose is *rendered* from those
//     facts by `describeRunError`, so the log physically cannot carry a
//     credential or an audience member's input — that's a property of the
//     shape, not of remembering to scrub.
//   * The record belongs to a Show first and a Run second. A Flow-driven
//     Device can be misconfigured before anyone goes live, so `runId` is
//     nullable and the failure is still recorded and still readable.
import type { RunErrorId, RunId, ShowId } from "./id";

// One entry per failure a runtime path can actually raise. Two of these are
// worth calling out, because a reader will otherwise wonder why they exist:
//
//   * `missingSceneCanvas` guards an invariant Postgres already enforces (the
//     deferred `canvases_owner_presence` trigger, apps/api/drizzle/
//     0013_canvas-presence.sql). Reaching it means the stored data is corrupt
//     rather than merely misconfigured, which is worth naming for support even
//     though no authoring mistake produces it.
//   * `incompleteEventRecord` describes the Event ledger contradicting itself,
//     not the Show — the one category about our own storage.
export const RUN_ERROR_CATEGORIES = [
  "deviceWithoutFlow",
  "missingSceneCanvas",
  "missingNavigationState",
  "invalidInteractions",
  "invalidNavigateAction",
  "incompleteEventRecord",
] as const;
export type RunErrorCategory = (typeof RUN_ERROR_CATEGORIES)[number];

/**
 * What a failing site knows about the failure: its category, plus whichever
 * identifiers name the affected configuration.
 *
 * Every identifier is optional for the same reason a `SlotDiagnostic`'s are:
 * one record shape serves every category, and which identifiers are meaningful
 * is the category's business. Identifiers are safe to store — they are
 * readable ids, not secrets (see `./id`) — and they are the whole structured
 * context, which is what keeps captured prose out of the log.
 */
export interface RunErrorDetail {
  readonly category: RunErrorCategory;
  readonly deviceId?: string;
  readonly sceneId?: string;
  readonly elementId?: string;
  readonly cueId?: string;
  readonly actionId?: string;
  readonly eventId?: string;
  /** The published graph version in play, which dates the failure to a publication. */
  readonly publishedGraphVersion?: number;
}

/** One recorded entry in a Show's Run error log. */
export interface RunError extends RunErrorDetail {
  readonly id: RunErrorId;
  readonly showId: ShowId;
  /** The Run underway when this happened, or `null` if none was. */
  readonly runId: RunId | null;
  readonly occurredAt: Date;
}

export function isRunErrorCategory(value: string): value is RunErrorCategory {
  return RUN_ERROR_CATEGORIES.includes(value as RunErrorCategory);
}

/**
 * Names one referenced thing. An absent identifier is a degenerate case —
 * every capture site knows the ids its category renders — so it reads as an
 * unnamed thing of the right kind rather than leaving a gap in the sentence.
 */
function named(kind: string, id: string | undefined): string {
  return id ? `${kind} "${id}"` : `an unidentified ${kind}`;
}

const DESCRIPTIONS: Record<RunErrorCategory, (error: RunErrorDetail) => string> = {
  deviceWithoutFlow: (error) =>
    `${named("Device", error.deviceId)} navigates per connection but belongs to no Flow, ` +
    `so it has no Scenes to move between.`,
  missingSceneCanvas: (error) =>
    `${named("Scene", error.sceneId)} has no published Canvas, so it cannot be displayed.`,
  missingNavigationState: (error) =>
    `${named("Device", error.deviceId)} has no navigation state in this Run, ` +
    `so Events from it cannot move it to another Scene. Start the Run again to restore it.`,
  invalidInteractions: (error) =>
    `The published interactions on ${named("Scene", error.sceneId)} are invalid, ` +
    `so Events from it cannot be resolved. Republish the Show to repair them.`,
  invalidNavigateAction: (error) =>
    `${named("Cue", error.cueId)} on ${named("Scene", error.sceneId)} does not lead to a ` +
    `Navigate Action targeting a Scene in the Device's Flow, so the Event went nowhere.`,
  incompleteEventRecord: (error) =>
    `${named("Event", error.eventId)} was recorded as applied but stored no resulting Scene, ` +
    `so its Device cannot be told where it ended up.`,
};

/** One concise sentence an operator can read, rendered from the stored facts. */
export function describeRunError(error: RunErrorDetail): string {
  return DESCRIPTIONS[error.category](error);
}
