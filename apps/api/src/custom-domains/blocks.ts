// Blocked Hostname lookups (issue #829, parent #827). A block covers its
// hostname and every ancestor of it (`hostnameAndAncestors`), and it is
// active while it hasn't been lifted. Add, prove and resolve all ask this
// one function, so they can't disagree about coverage.
import { and, inArray, isNull } from "drizzle-orm";

import { db } from "../db/client";
import { blockedHostnames } from "../db/schema";
import { hostnameAndAncestors } from "./hostname";

/**
 * The active block covering `hostname` — on the hostname itself or any of
 * its ancestors — or null. A lifted block covers nothing, and its row is
 * still there: see `blocked_hostnames` in the schema.
 */
export async function coveringBlock(
  hostname: string,
): Promise<typeof blockedHostnames.$inferSelect | null> {
  const blocks = await db
    .select()
    .from(blockedHostnames)
    .where(
      and(
        inArray(blockedHostnames.hostname, hostnameAndAncestors(hostname)),
        isNull(blockedHostnames.liftedAt),
      ),
    );
  return blocks[0] ?? null;
}
