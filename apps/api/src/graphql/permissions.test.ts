import { eq, inArray } from "drizzle-orm";
import { GraphQLError } from "graphql";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "../db/client";
import { user } from "../db/schema";
import { type GraphQLContext, requirePermission } from "./context";

const createdUserIds: string[] = [];

async function createUser(role = "user"): Promise<{ id: string; context: GraphQLContext }> {
  const id = `permissions-test-${crypto.randomUUID()}`;
  const email = `${id}@example.test`;
  const name = "Permissions Test";
  await db.insert(user).values({ id, name, email, emailVerified: true, role });
  createdUserIds.push(id);
  return {
    id,
    context: { userId: id, user: { id, name, email, emailVerified: true, role } },
  };
}

async function errorCode(check: Promise<unknown>): Promise<unknown> {
  const error = await check.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof GraphQLError)) throw new Error("Expected a GraphQLError.");
  return error.extensions.code;
}

afterEach(async () => {
  await db.delete(user).where(inArray(user.id, createdUserIds.splice(0)));
});

describe("requirePermission", () => {
  it("lets an admin administer users", async () => {
    const { id, context } = await createUser("admin");

    await expect(requirePermission(context, { user: ["list", "set-role", "ban"] })).resolves.toBe(
      id,
    );
  });

  it("forbids a user with the default role from administering users", async () => {
    const { context } = await createUser();

    expect(await errorCode(requirePermission(context, { user: ["list"] }))).toBe("FORBIDDEN");
  });

  it("requires every requested action, not just one", async () => {
    const { context } = await createUser("admin");

    // The admin role deliberately lacks impersonating other admins.
    expect(
      await errorCode(requirePermission(context, { user: ["list", "impersonate-admins"] })),
    ).toBe("FORBIDDEN");
  });

  it("reads the current role, so a demotion applies to an existing session", async () => {
    const { id, context } = await createUser("admin");
    await db.update(user).set({ role: "user" }).where(eq(user.id, id));

    expect(await errorCode(requirePermission(context, { session: ["revoke"] }))).toBe("FORBIDDEN");
  });

  it("rejects anonymous requests as unauthenticated", async () => {
    expect(
      await errorCode(requirePermission({ userId: null, user: null }, { user: ["list"] })),
    ).toBe("UNAUTHENTICATED");
  });
});
