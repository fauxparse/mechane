import { generateId } from "@mechane/domain";
import { createYoga } from "graphql-yoga";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "../db/client";
import { recordRunError } from "../db/run-errors";
import { shows, user } from "../db/schema";
import type { GraphQLContext } from "./context";
import { schema } from "./schema";

const RUN_ERRORS = /* GraphQL */ `
  query RunErrors($showId: ID!, $runId: ID, $category: String, $limit: Int) {
    runErrors(showId: $showId, runId: $runId, category: $category, limit: $limit) {
      id
      runId
      category
      message
      occurredAt
      deviceId
      sceneId
      cueId
      publishedGraphVersion
    }
  }
`;

interface RunErrorsData {
  runErrors: Array<{
    id: string;
    runId: string | null;
    category: string;
    message: string;
    occurredAt: string;
    deviceId: string | null;
    sceneId: string | null;
    cueId: string | null;
    publishedGraphVersion: number | null;
  }>;
}

let ownerId: string;
let intruderId: string;
let showId: string;

function contextFor(userId: string): GraphQLContext {
  return {
    userId,
    user: {
      id: userId,
      name: "Run Errors Test",
      email: `${userId}@example.test`,
      emailVerified: true,
    },
  };
}

async function query(userId: string, variables: Record<string, unknown>) {
  const yoga = createYoga<GraphQLContext>({
    schema,
    context: () => contextFor(userId),
    graphqlEndpoint: "/api/graphql",
    // A masked "Unexpected error." would tell a failing test nothing, and the
    // point here is which code the resolver chose.
    maskedErrors: false,
  });
  const response = await yoga.fetch("http://localhost/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: RUN_ERRORS, variables }),
  });
  expect(response.ok).toBe(true);
  return response.json() as Promise<{
    data?: RunErrorsData;
    errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
  }>;
}

beforeEach(async () => {
  ownerId = `run-errors-owner-${crypto.randomUUID()}`;
  intruderId = `run-errors-intruder-${crypto.randomUUID()}`;
  // Must be a real short Show id: `findOwnShowOrThrow` treats a malformed one
  // as a miss before it ever reaches the database.
  showId = generateId("show");
  for (const id of [ownerId, intruderId]) {
    await db.insert(user).values({
      id,
      name: "Run Errors Test",
      email: `${id}@example.test`,
      emailVerified: true,
    });
  }
  await db.insert(shows).values({ id: showId, name: "Run Errors Test", userId: ownerId });
});

afterEach(async () => {
  await db.delete(user).where(eq(user.id, ownerId));
  await db.delete(user).where(eq(user.id, intruderId));
});

describe("the runErrors query", () => {
  it("renders each entry for the operator reading it", async () => {
    await recordRunError({
      showId,
      runId: null,
      category: "invalidNavigateAction",
      deviceId: "dproject",
      sceneId: "cred001",
      cueId: "qnext01",
      publishedGraphVersion: 4,
    });

    const result = await query(ownerId, { showId });

    expect(result.errors).toBeUndefined();
    expect(result.data?.runErrors).toHaveLength(1);
    const [entry] = result.data?.runErrors ?? [];
    expect(entry).toMatchObject({
      runId: null,
      category: "invalidNavigateAction",
      deviceId: "dproject",
      sceneId: "cred001",
      cueId: "qnext01",
      publishedGraphVersion: 4,
    });
    // The stable discriminator is what a client filters on; the message is
    // what a person reads. Both travel, and the message names the same things.
    expect(entry?.message).toContain('Cue "qnext01"');
    expect(entry?.message).toContain('Scene "cred001"');
    expect(new Date(entry?.occurredAt ?? "").getTime()).toBeGreaterThan(0);
  });

  it("refuses an unknown category instead of returning nothing", async () => {
    const result = await query(ownerId, { showId, category: "notACategory" });

    expect(result.data?.runErrors).toBeUndefined();
    expect(result.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
  });

  it("hides another user's log behind the same answer as a missing Show", async () => {
    await recordRunError({ showId, runId: null, category: "deviceWithoutFlow" });

    const result = await query(intruderId, { showId });

    expect(result.data?.runErrors).toBeUndefined();
    expect(result.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
  });
});
