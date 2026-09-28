// Fixtures for the Custom Domains tests. The test database is shared between
// runs, so hostnames and pairing codes carry per-run randomness: the unique
// indexes under test must never collide with another run's rows.
import { CODE_ALPHABET } from "@mechane/domain/pairing-code";
import { generateId } from "@mechane/domain/id";

import { db } from "../db/client";
import { customDomains, devices, user } from "../db/schema";

export function randomPairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]!).join("");
}

/** A hostname unique to this test run, under a real public suffix. */
export function uniqueHostname(label: string): string {
  return `${label}-${crypto.randomUUID().slice(0, 8)}.nz`;
}

/** A saved Device of `showId`, returning its id and pairing code. */
export async function createDevice(
  showId: string,
  values: Partial<typeof devices.$inferInsert> = {},
): Promise<{ id: string; pairingCode: string }> {
  const id = values.id ?? generateId("device");
  const pairingCode = values.pairingCode ?? randomPairingCode();
  await db.insert(devices).values({ ...values, id, showId, pairingCode });
  return { id, pairingCode };
}

export async function insertCustomDomain(
  values: Pick<typeof customDomains.$inferInsert, "userId" | "hostname"> &
    Partial<typeof customDomains.$inferInsert>,
): Promise<typeof customDomains.$inferSelect> {
  const [row] = await db
    .insert(customDomains)
    .values({ status: "unverified", proofToken: `proof-${values.hostname}`, ...values })
    .returning();
  return row!;
}

/** A second account; the caller deletes it (cascading its domains). */
export async function createUser(label: string): Promise<string> {
  const id = `${label}-${crypto.randomUUID()}`;
  await db
    .insert(user)
    .values({ id, name: label, email: `${id}@example.com`, emailVerified: true });
  return id;
}
