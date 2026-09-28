import { generateId } from "@mechane/domain/id";
import { eq, inArray } from "drizzle-orm";
import { createYoga } from "graphql-yoga";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "../db/client";
import { shows, user } from "../db/schema";
import type { GraphQLContext } from "./context";
import { schema } from "./schema";

const createdUserIds: string[] = [];

async function createUser(role = "user"): Promise<{ id: string; context: GraphQLContext }> {
  const id = `admin-test-${crypto.randomUUID()}`;
  const email = `${id}@example.test`;
  const name = "Admin Test";
  await db.insert(user).values({ id, name, email, emailVerified: true, role });
  createdUserIds.push(id);
  return { id, context: { userId: id, user: { id, name, email, emailVerified: true, role } } };
}

async function createShow(userId: string, name: string, updatedAt: Date): Promise<string> {
  const id = generateId("show");
  await db.insert(shows).values({ id, name, userId, updatedAt });
  return id;
}

async function execute<T>(
  context: GraphQLContext,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ data?: T | null; errors?: { extensions?: { code?: string } }[] }> {
  const yoga = createYoga<GraphQLContext>({
    schema,
    context: () => context,
    graphqlEndpoint: "/api/graphql",
    maskedErrors: false,
  });
  const response = await yoga.fetch("http://localhost/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return (await response.json()) as never;
}

const USER_SHOWS = "query ($userId: ID!) { userShows(userId: $userId) { id name } }";
const ADMIN_DELETE_SHOW = "mutation ($id: ID!) { adminDeleteShow(id: $id) }";

afterEach(async () => {
  await db.delete(user).where(inArray(user.id, createdUserIds.splice(0)));
});

describe("userShows", () => {
  it("lists another user's Shows for an admin, most recently updated first", async () => {
    const admin = await createUser("admin");
    const owner = await createUser();
    const older = await createShow(owner.id, "Older", new Date("2026-01-01"));
    const newer = await createShow(owner.id, "Newer", new Date("2026-02-01"));

    const result = await execute<{ userShows: { id: string }[] }>(admin.context, USER_SHOWS, {
      userId: owner.id,
    });

    expect(result.data?.userShows.map((show) => show.id)).toEqual([newer, older]);
  });

  it("forbids a user without the show:list permission", async () => {
    const caller = await createUser();
    const owner = await createUser();
    await createShow(owner.id, "Private", new Date());

    const result = await execute(caller.context, USER_SHOWS, { userId: owner.id });

    expect(result.data).toBeNull();
    expect(result.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  });
});

describe("adminDeleteShow", () => {
  it("lets an admin delete a Show they do not own", async () => {
    const admin = await createUser("admin");
    const owner = await createUser();
    const showId = await createShow(owner.id, "Doomed", new Date());

    const result = await execute<{ adminDeleteShow: boolean }>(admin.context, ADMIN_DELETE_SHOW, {
      id: showId,
    });

    expect(result.data?.adminDeleteShow).toBe(true);
    expect(await db.select().from(shows).where(eq(shows.id, showId))).toEqual([]);
  });

  it("forbids a user without the show:delete permission, leaving the Show", async () => {
    const caller = await createUser();
    const owner = await createUser();
    const showId = await createShow(owner.id, "Safe", new Date());

    const result = await execute(caller.context, ADMIN_DELETE_SHOW, { id: showId });

    expect(result.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    expect(await db.select().from(shows).where(eq(shows.id, showId))).toHaveLength(1);
  });

  it.each([
    ["an unknown", generateId("show")],
    ["a malformed", "not-a-show-id"],
  ])("reports %s id as not found", async (_label, id) => {
    const admin = await createUser("admin");

    const result = await execute(admin.context, ADMIN_DELETE_SHOW, { id });

    expect(result.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
  });
});
