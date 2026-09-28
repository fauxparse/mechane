import { and, eq, inArray, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "../db/client";
import { rateLimits } from "../db/schema";
import { consumeRateLimit, type RateLimitBucket } from "./rate-limit";

const run = crypto.randomUUID();
const key = "shared-key";
const minute: RateLimitBucket = { name: `test-${run}-minute`, limit: 2, windowSeconds: 60 };
const day: RateLimitBucket = { name: `test-${run}-day`, limit: 2, windowSeconds: 24 * 60 * 60 };

function row(bucket: RateLimitBucket) {
  return and(eq(rateLimits.bucket, bucket.name), eq(rateLimits.key, key));
}

async function startWindowSecondsAgo(bucket: RateLimitBucket, seconds: number) {
  await db
    .update(rateLimits)
    .set({ windowStartedAt: sql`now() - make_interval(secs => ${seconds})` })
    .where(row(bucket));
}

afterEach(async () => {
  await db.delete(rateLimits).where(inArray(rateLimits.bucket, [minute.name, day.name]));
});

describe("consumeRateLimit", () => {
  it("counts each bucket separately for a shared key", async () => {
    for (let n = 0; n < minute.limit; n += 1) {
      expect((await consumeRateLimit(minute, key)).allowed).toBe(true);
    }
    expect((await consumeRateLimit(minute, key)).allowed).toBe(false);

    for (let n = 0; n < day.limit; n += 1) {
      expect(await consumeRateLimit(day, key)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    }
    expect((await consumeRateLimit(day, key)).allowed).toBe(false);
  });

  it("prunes only its own bucket when the shorter window lapses", async () => {
    await consumeRateLimit(minute, key);
    await consumeRateLimit(day, key);
    await consumeRateLimit(day, key);
    await startWindowSecondsAgo(minute, 120);
    await startWindowSecondsAgo(day, 120);

    await consumeRateLimit(minute, key);

    const [minuteRow] = await db.select().from(rateLimits).where(row(minute));
    const [dayRow] = await db.select().from(rateLimits).where(row(day));
    expect(minuteRow?.attempts).toBe(1);
    expect(dayRow?.attempts).toBe(2);
    expect((await consumeRateLimit(day, key)).allowed).toBe(false);
  });

  it("reports the time left in the window when refusing", async () => {
    await consumeRateLimit(minute, key);
    await consumeRateLimit(minute, key);
    await startWindowSecondsAgo(minute, 20);

    expect(await consumeRateLimit(minute, key)).toEqual({ allowed: false, retryAfterSeconds: 40 });
  });
});
