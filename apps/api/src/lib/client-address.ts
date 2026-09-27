// Which client a request came from, for per-client limits such as the
// waitlist's (graphql/waitlist.ts).
//
// The address is the last X-Forwarded-For entry: the one the nearest proxy
// wrote. Vercel overwrites the header with the connecting client's address,
// and the local Caddy proxy writes it too. Earlier entries are whatever the
// client sent, so trusting them would let a script pick a fresh address per
// request. Without a proxy (a worktree's direct HTTP instance) the header is
// absent or client-written; that is a development-only gap.
//
// IPv6 addresses are cut to their /64. A single subscriber is routinely handed
// a whole /64, so counting single addresses would let one client rotate
// through 2^64 of them.
import { isIPv4, isIPv6 } from "node:net";

function ipv6Key(address: string): string {
  // WHATWG URL parsing canonicalizes an IPv6 host: lowercase hex, embedded
  // IPv4 rewritten as two hex groups, the longest zero run compressed to "::".
  // It rejects a zone id ("%eth0"), which names a local interface, not a client.
  const unzoned = address.split("%")[0] ?? address;
  const canonical = new URL(`http://[${unzoned}]`).hostname.slice(1, -1);
  const [head = "", tail = ""] = canonical.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right];

  // An IPv4-mapped address (::ffff:a.b.c.d) is an IPv4 client on a dual-stack
  // socket. Its /64 is shared by every IPv4 client, so key it on the IPv4.
  if (groups.slice(0, 5).every((group) => group === "0") && groups[5] === "ffff") {
    const high = Number.parseInt(groups[6] ?? "0", 16);
    const low = Number.parseInt(groups[7] ?? "0", 16);
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
  }
  return `${groups.slice(0, 4).join(":")}::/64`;
}

/** The client's rate-limit key, or null when the request carries no usable address. */
export function clientAddress(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  if (!forwarded) return null;
  if (isIPv4(forwarded)) return forwarded;
  if (isIPv6(forwarded)) return ipv6Key(forwarded);
  return null;
}
