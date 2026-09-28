// Cache tags for resolve's edge-cached responses (issue #830, parent #827).
// Vercel purges by tag (#825, decision 5): every resolve response names its
// hostname and each parent hostname, so blocking `x.nz` — or rebinding,
// revoking or removing a domain — can evict every cached subdomain under it.
// The provider seam's eviction method takes these strings; they are built in
// this one module so no caller invents its own spelling of a tag.
import { hostnameAndAncestors } from "./hostname";

/** The cache tag for one hostname's resolve responses. */
export function playerDomainCacheTag(host: string): string {
  return `player-domain:${host}`;
}

/**
 * The tags for `host` followed by every parent hostname above it:
 * `vote.x.nz` → `player-domain:vote.x.nz`, `player-domain:x.nz`.
 */
export function playerDomainCacheTags(host: string): string[] {
  return hostnameAndAncestors(host).map(playerDomainCacheTag);
}
