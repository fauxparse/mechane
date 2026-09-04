# The Run error log is product data, not telemetry

- Status: Accepted
- Issue: #459

## Decision

A Run Error is a `run_errors` row: a stable category from a closed set, a timestamp, and the identifiers of the Device, Scene, Element, Cue, Action or Event it concerns. Prose is rendered from those facts by `describeRunError` in `@mechane/domain`; no message, exception text, or request payload is stored. The log therefore cannot carry a credential or an audience member's input, by shape rather than by scrubbing.

The record belongs to a Show, with a nullable `runId`. Configuration read before anyone goes live can fail, and that failure is the one most worth seeing, so it is recorded with no Run attached rather than dropped.

Entries are written on their own connection, never a caller's transaction. Every failure this log exists to capture aborts the transaction that discovered it, so an entry written inside it would roll back with the evidence. `withRunErrorLog` wraps each capture boundary, records, and rethrows unchanged; a failed write is swallowed so the caller still receives the failure it has to handle.

The owner reads the log through `Query.runErrors(showId, runId, category, limit)`, which renders each entry's message and returns identifiers for filtering. Players never reach it: they keep receiving the same undetailed "Unable to process the Player Event."

Retention deliberately differs from the Event ledger. `endRun` drops `player_events` with the Run's live state, because that ledger exists to make a retried Event idempotent within one Run. Run Errors outlive the Run and are removed only with their Show, because the post-mortem happens after the curtain comes down. The GraphQL query is the export path; there is no separate file export.

The identifier columns carry no foreign keys, unlike every other Run-scoped table. They record what was named at the time. An audit trail that deleted itself when a Device was retired or a Scene removed would erase the evidence of the very edit that broke the show.

## Consequences

- The category set is closed, and adding a category is a deliberate schema-free change in one domain module plus a rendering. Genuinely unexpected exceptions stay unexpected exceptions rather than landing in a catch-all bucket that would reintroduce captured prose — that is the seam where error-tracking tooling belongs (PRD.md, deferred).
- `missingSceneCanvas` guards an invariant Postgres already enforces through the deferred `canvases_owner_presence` trigger. Reaching it means stored data is corrupt rather than misconfigured; it is kept for support diagnosis and cannot be staged from a test.
- A Show accumulates entries indefinitely. Bounded by `limit` on read; no pruning job exists, and one becomes necessary only if a Show's log grows past what a single query should return.
- No Studio surface reads the log yet. The query and its typed document exist, so a panel is a client-only change.
