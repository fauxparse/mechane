import { generateId } from "@mechane/domain";
import { eq } from "drizzle-orm";
import { afterEach } from "vitest";

import { db } from "./client";
import { shows, user } from "./schema";
export function setupPostgresTest(name: string) {
  const userId = `${name}-${crypto.randomUUID()}`;
  const showId = generateId("show");

  async function createShow(showName = name): Promise<void> {
    await db.insert(user).values({
      id: userId,
      name: showName,
      email: `${userId}@example.com`,
      emailVerified: true,
    });
    await db.insert(shows).values({ id: showId, name: showName, userId });
  }

  afterEach(async () => {
    await db.delete(user).where(eq(user.id, userId));
  });

  return { userId, showId, createShow };
}
