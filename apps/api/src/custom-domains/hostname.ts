// Hostname rules for Custom Domains (issue #829, parent #827). Pure
// functions only — no database, no provider — so add, prove, resolve, links
// and QR codes all agree on what a hostname is, which ones Mechanē refuses,
// and which statuses count as live.
import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { parse } from "tldts";

/** Zones Mechanē itself owns, held as one list so nothing forks it. */
export const MECHANE_OWNED_ZONES = ["mechane.live", "mechane.dev"] as const;

/** Every lifecycle state a Custom Domain can be in (#817). */
export const CUSTOM_DOMAIN_STATUSES = [
  "unverified",
  "connecting",
  "securing",
  "live",
  "needs_attention",
  "revoked",
] as const;
export type CustomDomainStatus = (typeof CUSTOM_DOMAIN_STATUSES)[number];

/**
 * The statuses past the Ownership Proof: `unverified` hasn't got there and
 * `revoked` has deliberately left. At most one Custom Domain per hostname
 * may hold any of them, which the partial unique index on
 * `custom_domains.hostname` enforces.
 */
export const PROVEN_CUSTOM_DOMAIN_STATUSES = [
  "connecting",
  "securing",
  "live",
  "needs_attention",
] as const;

export function isProvenCustomDomainStatus(status: CustomDomainStatus): boolean {
  return (PROVEN_CUSTOM_DOMAIN_STATUSES as readonly CustomDomainStatus[]).includes(status);
}

/**
 * The live statuses (CONTEXT.md, Custom Domain): a domain stays live through
 * failed rechecks, so `needs_attention` still resolves and links, QR codes
 * and Address keep using it, until it lapses or is revoked or removed.
 */
export const LIVE_CUSTOM_DOMAIN_STATUSES = ["live", "needs_attention"] as const;

/** The one predicate for "this status serves visitors" — see the doc above. */
export function isLiveCustomDomainStatus(status: CustomDomainStatus): boolean {
  return (LIVE_CUSTOM_DOMAIN_STATUSES as readonly CustomDomainStatus[]).includes(status);
}

/** Why Mechanē refuses a hostname as a Custom Domain. */
export const HOSTNAME_REFUSAL_CODES = [
  "invalid_hostname",
  "ip_address",
  "wildcard",
  "mechane_owned_zone",
  "public_suffix",
  "localhost",
] as const;
export type HostnameRefusalCode = (typeof HOSTNAME_REFUSAL_CODES)[number];

// One DNS label (RFC 1123): letters, digits and inner hyphens, at most 63
// characters. `domainToASCII` passes empty labels ("foo..bar") and IP-literal
// oddities through, so this is where they stop being hostnames.
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Normalises a candidate hostname: trims, strips trailing dots, lowercases
 * and converts to punycode (`node:url`'s `domainToASCII`). Returns null for
 * anything that isn't a bare hostname — garbage, empty labels, IP literals.
 */
export function normaliseHostname(input: string): string | null {
  const trimmed = input.trim().replace(/\.+$/, "");
  if (trimmed === "") return null;
  const hostname = domainToASCII(trimmed).toLowerCase();
  if (hostname === "" || hostname.length > 253) return null;
  return hostname.split(".").every((label) => LABEL_PATTERN.test(label)) ? hostname : null;
}

/**
 * The refusal code for a hostname, or null when Mechanē can accept it.
 * `.localhost` is the one caller-dependent refusal: it passes only with
 * `allowLocalhost`, which the provider seam sets for the local provider.
 */
export function hostnameRefusalCode(
  hostname: string,
  options: { allowLocalhost?: boolean } = {},
): HostnameRefusalCode | null {
  const raw = hostname.trim();
  // `domainToASCII` passes wildcards straight through, so recognise them
  // before they can be mistaken for an odd-looking hostname.
  if (raw.includes("*")) return "wildcard";
  // IP literals: IPv4 survives normalisation unchanged, but IPv6 does not
  // (and bracketed forms keep their brackets), so test the input directly.
  const unbracketed = raw.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (isIP(raw) !== 0 || isIP(unbracketed) !== 0) return "ip_address";
  const normalised = normaliseHostname(raw);
  if (normalised === null) return "invalid_hostname";
  if (normalised === "localhost" || normalised.endsWith(".localhost")) {
    return options.allowLocalhost === true ? null : "localhost";
  }
  if (MECHANE_OWNED_ZONES.some((zone) => normalised === zone || normalised.endsWith(`.${zone}`))) {
    return "mechane_owned_zone";
  }
  // A hostname that is itself a Public Suffix List entry (`co.nz`, and — by
  // the PSL's default rule — any unlisted TLD) can't be owned, so nobody can
  // hold it as a Custom Domain. Private-section entries count too.
  if (parse(normalised, { allowPrivateDomains: true }).publicSuffix === normalised) {
    return "public_suffix";
  }
  return null;
}
/**
 * A hostname followed by each of its ancestors, stopping at the registrable
 * domain and never reaching the bare suffix: `a.b.x.nz` → `a.b.x.nz`,
 * `b.x.nz`, `x.nz`. Blocked-hostname lookups and resolve's cache tags both
 * walk this list. Unnormalisable input yields just itself, lowercased, so a
 * hostile Host header can't turn into a throw.
 */
export function hostnameAndAncestors(hostname: string): string[] {
  const normalised = normaliseHostname(hostname);
  if (normalised === null) {
    return [hostname.trim().replace(/\.+$/, "").toLowerCase()];
  }
  const registrable = parse(normalised, { allowPrivateDomains: true }).domain ?? normalised;
  const ancestors = [normalised];
  for (
    let current = normalised;
    current !== registrable;
    current = current.slice(current.indexOf(".") + 1)
  ) {
    const parent = current.slice(current.indexOf(".") + 1);
    // Never go below two labels: without a registrable domain to stop at,
    // the bare TLD is not an ancestor anyone may block or purge on.
    if (parent === "" || !parent.includes(".")) break;
    ancestors.push(parent);
  }
  return ancestors;
}
