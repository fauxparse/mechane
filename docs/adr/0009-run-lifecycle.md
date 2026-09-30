# Runs own live Source values and have one active instance per Show

- Status: Accepted
- Issue: #7

## Decision

A Run is a database row belonging to a Show. It has an `active`/`ended` lifecycle represented by `status`, timestamps, and a JSONB snapshot of live Source values. Starting a Run is transactional: it locks the Show, ends any active Run, reads the published graph, materialises Source defaults, and creates the new active Run. Ending a Run is also transactional and idempotent when no Run is active.

The published graph is the source of defaults. Draft-only structural changes cannot affect a Run until publication. Source values are copied into the Run at start time so a live performance is isolated from later graph edits.

The API exposes `activeRun`, `startRun`, and `endRun`. Studio exposes Go live/End run controls in the Show editor chrome and reflects the active state after mutation. Go live publishes the draft first when it has unpublished changes, and starts the Run only if that publication succeeds; `startRun` itself never publishes.

Studio's Go live mutation owns the start request and invalidates the active-Run query after success. Publication updates and invalidates the published graph independently, so a successful publication still refreshes Studio if starting the Run then fails.

## Consequences

- At most one Run is active per Show by application-level serialisation on the Show row lock.
- A Run keeps its own live values; future live-value mutations can publish updates for that Run without touching draft/published structure.
- Run history remains available after ending, while only the active Run is used for live operation.
- Concurrent Runs for one Show remain out of scope.
