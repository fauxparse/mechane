# Transactional Player invalidations with hybrid Vercel delivery

- Status: Accepted
- Issue: [Define durable Player invalidation delivery](https://github.com/fauxparse/mechane/issues/457)

## Decision

Player-visible changes write a durable invalidation outbox row in the same database transaction as the state change. A delivery drain claims rows with leases, publishes `player.updated` through the realtime abstraction, and acknowledges rows only after the provider accepts the publish.

Production uses a hybrid drain:

1. The originating API request attempts to drain the newly-created pending invalidation after its transaction commits. This is a latency optimization, not a correctness dependency.
2. A protected Vercel Function endpoint drains bounded batches on a Vercel Cron schedule. Cron is the durable recovery trigger for requests that fail, are terminated, or never reach the inline attempt.
3. The same database lease, per-Device FIFO, retry, and coalescing rules apply to both paths. Multiple drains may overlap safely.

Local development runs the drain as a persistent worker process so the manual smoke flow does not depend on Cron timing.

Delivery is at-least-once. Vercel Cron delivery is best effort: scheduled invocations may be missed or duplicated, failed invocations are not retried automatically, and overlapping invocations are possible. The outbox therefore retries indefinitely with exponential backoff, reclaims expired leases, and treats duplicate `player.updated` messages as safe invalidations. Players refetch authoritative GraphQL state after bootstrap, reconnect, and invalidation.

A separate always-on worker is not required for production correctness, but remains an optional operational replacement if lower latency or higher throughput later justifies another runtime service.

## Consequences

- No long-lived worker process is assumed to run inside a Vercel serverless deployment.
- The API must expose a protected internal drain route and configure a Vercel Cron schedule with `CRON_SECRET`.
- The drain must process bounded batches within Vercel Function duration limits and return without waiting for the whole outbox.
- The inline attempt improves live-show responsiveness while the outbox preserves recovery if the request or provider fails.
- Database state, not Cron execution history, is the source of pending work; a later Cron invocation catches up after a missed schedule.
- Local `Procfile.dev` gains a worker process even though production uses the Vercel Function plus Cron.

## References

- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Managing Cron Jobs: duration, failures, concurrency, and idempotency](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [ADR-0003: Ably for realtime pub/sub, behind an internal abstraction](./0003-ably-behind-realtime-abstraction.md)
