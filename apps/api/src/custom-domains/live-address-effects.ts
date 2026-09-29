// What happens when a Device's live address changes: a domain enters or
// leaves the live set, or a live domain is bound, rebound, unbound, removed
// or revoked. Visitors reach the new answer once resolve's CDN cache is
// evicted, and projectors redraw other Devices' QR codes and Address outputs
// once their Show's Players are invalidated (ADR-0015). Invalidation is
// enqueued inside the change's transaction; eviction runs after it commits.
import { enqueuePlayerInvalidations, type Tx } from "../db/player-invalidation-outbox";
import { playerDomainCacheTags } from "./cache-tags";
import type { CustomDomainsProvider } from "./provider";

/** Enqueues a Player invalidation for every Show whose addresses changed. */
export async function invalidateShowsForAddressChange(
  tx: Tx,
  showIds: Iterable<string | null | undefined>,
): Promise<void> {
  for (const showId of new Set(showIds)) {
    if (showId) await enqueuePlayerInvalidations(tx, showId);
  }
}

/** Evicts resolve's cached answers for each hostname. Best-effort. */
export async function evictResolvedHostnames(
  provider: CustomDomainsProvider,
  hostnames: Iterable<string>,
): Promise<void> {
  for (const hostname of new Set(hostnames)) {
    await provider.evictResolveCache(playerDomainCacheTags(hostname));
  }
}
