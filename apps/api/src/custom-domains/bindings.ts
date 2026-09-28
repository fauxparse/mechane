// Unbinding Custom Domains from Devices that go away. Binding is not part
// of the draft (ADR-0002): it applies straight away, and it is released
// when publishing retires a Device. Deleting a Show releases its bindings
// through the foreign key instead.
import { and, eq, inArray } from "drizzle-orm";

import type { Tx } from "../db/player-invalidation-outbox";
import { customDomains } from "../db/schema";
import { isLiveCustomDomainStatus } from "./hostname";

/**
 * Unbinds the domains bound to these Devices of `showId`, returning the
 * hostnames that were live, whose resolve cache the caller evicts once the
 * transaction commits.
 */
export async function unbindDomainsOfDevices(
  tx: Tx,
  showId: string,
  deviceIds: readonly string[],
): Promise<string[]> {
  if (deviceIds.length === 0) return [];
  const unbound = await tx
    .update(customDomains)
    .set({ deviceShowId: null, deviceId: null })
    .where(
      and(eq(customDomains.deviceShowId, showId), inArray(customDomains.deviceId, [...deviceIds])),
    )
    .returning({ hostname: customDomains.hostname, status: customDomains.status });
  return unbound.filter((row) => isLiveCustomDomainStatus(row.status)).map((row) => row.hostname);
}
