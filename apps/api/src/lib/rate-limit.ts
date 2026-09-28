// Fixed-window rate limits keyed by (bucket, key), such as waitlist sign-ups
// per client network (graphql/waitlist.ts).
//
// The counters live in Postgres because the API runs as Vercel functions: an
// in-memory count resets with each instance and isn't shared between them,
// and Better Auth's limiter only sees /api/auth/*.
//
// A key's window starts at its first attempt and lasts the bucket's
// `windowSeconds`. Every attempt counts, refused ones included, so hammering
// a limit doesn't shorten the wait. Lapsed rows are pruned one bucket at a
// time, so a short window never deletes a long window's rows.
import { and, eq, lt, sql } from "drizzle-orm";
import { GraphQLError } from "graphql";

import { db } from "../db/client";
import { rateLimits } from "../db/schema";

export interface RateLimitBucket {
  /** Stored as rate_limits.bucket, so no two buckets may share a name. */
  readonly name: string;
  /** Attempts one key may make per window. */
  readonly limit: number;
  /** Window length, counted from the key's first attempt. */
  readonly windowSeconds: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  /** Seconds left in the key's window when refused; 0 when allowed. */
  readonly retryAfterSeconds: number;
}

/**
 * Counts one attempt against `key`'s window in `bucket`. Deleting the
 * bucket's lapsed windows first is also what resets a returning key: its old
 * row is gone, so the upsert starts a new window at one attempt.
 */
export async function consumeRateLimit(
  bucket: RateLimitBucket,
  key: string,
): Promise<RateLimitResult> {
  const window = sql`make_interval(secs => ${bucket.windowSeconds})`;
  await db
    .delete(rateLimits)
    .where(
      and(
        eq(rateLimits.bucket, bucket.name),
        lt(rateLimits.windowStartedAt, sql`now() - ${window}`),
      ),
    );
  const [row] = await db
    .insert(rateLimits)
    .values({ bucket: bucket.name, key })
    .onConflictDoUpdate({
      target: [rateLimits.bucket, rateLimits.key],
      set: { attempts: sql`${rateLimits.attempts} + 1` },
    })
    .returning({
      attempts: rateLimits.attempts,
      // At least 1: a window that lapses mid-request still refused this one.
      secondsLeft: sql<number>`greatest(ceil(extract(epoch from ${rateLimits.windowStartedAt} + ${window} - now())), 1)::integer`,
    });
  if (!row || row.attempts <= bucket.limit) return { allowed: true, retryAfterSeconds: 0 };
  return { allowed: false, retryAfterSeconds: row.secondsLeft };
}

/**
 * Counts one attempt like `consumeRateLimit`, refusing it past the limit with
 * a RATE_LIMITED GraphQL error carrying `message`.
 */
export async function assertWithinRateLimit(
  bucket: RateLimitBucket,
  key: string,
  message: string,
): Promise<void> {
  const { allowed } = await consumeRateLimit(bucket, key);
  if (!allowed) throw new GraphQLError(message, { extensions: { code: "RATE_LIMITED" } });
}
