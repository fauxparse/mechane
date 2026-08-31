import type { GraphQLContext } from "./context";
import { createYoga } from "graphql-yoga";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { seedShow } from "../db/seeds/shows/navigation-proof/navigation-proof";
import { db } from "../db/client";
import { readRunDeviceState, startRun } from "../db/runs";
import { readShowGraph } from "../db/show-graph";
import { shows, user } from "../db/schema";
import { schema } from "./schema";

const SUBMIT_PLAYER_EVENT = /* GraphQL */ `
  mutation SubmitPlayerEvent($input: PlayerEventInput!) {
    submitPlayerEvent(input: $input) {
      __typename
      ... on PlayerEventApplied {
        eventId
        appliedResultingSceneId: resultingSceneId
      }
      ... on PlayerEventDuplicate {
        eventId
        outcome
        duplicateResultingSceneId: resultingSceneId
        duplicateReason: reason
      }
      ... on PlayerEventIgnored {
        eventId
        ignoredReason: reason
      }
    }
  }
`;

const userId = `player-event-test-${crypto.randomUUID()}`;
const showId = `player-event-show-${crypto.randomUUID()}`;

function yoga(context: GraphQLContext) {
  return createYoga<GraphQLContext>({
    schema,
    context: () => context,
    graphqlEndpoint: "/api/graphql",
  });
}

async function request(
  context: GraphQLContext,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await yoga(context).fetch("http://localhost/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: SUBMIT_PLAYER_EVENT, variables }),
  });
  expect(response.ok).toBe(true);
  const body = (await response.json()) as {
    data?: { submitPlayerEvent: Record<string, unknown> };
    errors?: unknown[];
  };
  expect(body.errors).toBeUndefined();
  if (!body.data) throw new Error("GraphQL response did not contain data.");
  return body.data.submitPlayerEvent;
}

async function createShow(): Promise<void> {
  await db.insert(user).values({
    id: userId,
    name: "Player Event Test",
    email: `${userId}@example.com`,
    emailVerified: true,
  });
  await db.insert(shows).values({ id: showId, name: "Player Event Test", userId });
}

afterEach(async () => {
  await db.delete(user).where(eq(user.id, userId));
});

describe("submitPlayerEvent", () => {
  it("applies, deduplicates, and rejects stale Player taps", async () => {
    await createShow();
    await seedShow.seed(showId);
    const run = await startRun(showId);
    const published = await readShowGraph(showId, "published");
    const device = published.nodes.find((node) => node.kind === "device");
    const binding = published.eventBindings?.find(
      (candidate) => candidate.elementId === "button_scene_red_scene_green",
    );
    if (device?.kind !== "device" || !device.pairingCode || !binding) {
      throw new Error("Navigation Proof Player fixture is incomplete.");
    }
    const context: GraphQLContext = {
      userId: null,
      user: null,
      playerPairingCode: device.pairingCode,
    };
    const input = {
      eventId: crypto.randomUUID(),
      sceneId: "scene_red",
      elementId: binding.elementId,
      eventKind: "tap",
    };

    await expect(request(context, { input })).resolves.toMatchObject({
      __typename: "PlayerEventApplied",
      appliedResultingSceneId: "scene_green",
    });
    expect((await readRunDeviceState(run.id, device.id))?.activeSceneId).toBe("scene_green");
    await expect(request(context, { input })).resolves.toMatchObject({
      __typename: "PlayerEventDuplicate",
      outcome: "applied",
      duplicateResultingSceneId: "scene_green",
    });
    await expect(
      request(context, {
        input: { ...input, eventId: crypto.randomUUID() },
      }),
    ).resolves.toMatchObject({ __typename: "PlayerEventIgnored", ignoredReason: "stale-scene" });
  });
});
