# Custom Domains ride Vercel project domains behind a Mechanē Ownership Proof, resolved client-side with split-horizon CORS

- Status: Accepted
- Issue: #830; decided in #814 (#815, #816, #817, #822, #823, #825)

## Decision

A Custom Domain is served by adding its hostname to the Player's Vercel project as a project domain. Vercel then routes it to the Player's current production deployment and issues its Let's Encrypt certificate. Mechanē adds the hostname to Vercel only after it finds the domain's own Ownership Proof, a `_mechane` TXT record carrying a per-domain token, in the hostname's DNS. Vercel's `verified` and `misconfigured` flags feed Mechanē's status machine but never decide it.

The Player works out which Device a hostname opens in the browser. On any host other than its canonical one, `/` calls `GET /api/player-domains/resolve?host=<location.host>`, receives the bound Device's pairing code, and renders that Device through the usual pairing-code session. The URL bar doesn't change. Resolve answers 200 or 404 with `Cache-Control: public, max-age=0, s-maxage=60` and a `Vercel-Cache-Tag` for the hostname and each parent hostname, so the CDN absorbs repeat visits and a block on a parent can evict every subdomain beneath it.

CORS is split-horizon. An origin on the allowlist (Studio, the canonical Player, the holding page) keeps the credentialed exact-origin echo. Any other origin calling GraphQL or `/api/realtime/auth` gets `Access-Control-Allow-Origin: *` with no credentials header. Resolve answers every origin with `*`, because a CDN-cached response must be valid for whichever origin next reads it. Sign-in and uploads stay first-party, and Better Auth's `trustedOrigins` doesn't change. The Player sends its GraphQL requests with `credentials: "omit"`.

Alternatives considered:

- **Adding the hostname to Vercel as soon as the user enters it.** Anyone could park a hostname they don't control on the Player project, squatting it before its owner arrives. A hostname whose DNS still points at Vercel after its owner has moved on is a dangling record that anyone could claim. Requiring Mechanē's own proof first, and keeping it in place for as long as the domain is served, closes both.
- **Cloudflare for SaaS in front of the Player, or a self-hosted Caddy with on-demand TLS.** Both add a second TLS and DNS system, and Caddy adds an always-on server, against ADR-0001. Vercel project domains cost nothing per domain on Pro and need no new infrastructure (#815).
- **An edge rewrite from the hostname to `/s/<code>`.** Vercel's config-level rewrites can't read the database, and a rewrite changes what the server returns without reaching the client router, which decides what to render from the path. Edge Middleware could do it, so it is the upgrade path if first-paint latency on a Custom Domain ever matters more than one extra request.
- **A dynamic CORS allowlist of verified Custom Domains.** Every GraphQL request would read the domains table or a cache of it, and the Player gains nothing from credentials: it authenticates with its pairing code as a Bearer token.

## Consequences

- `*` is safe only because it is uncredentialed. A browser won't expose the response to a credentialed request answered with `*`, so a page on a foreign origin can read what a pairing code already grants but can't ride a signed-in Studio session. Any route that relies on the session cookie must stay on the allowlist-only policy.
- A rebind, removal, revocation or block evicts the resolve cache by tag, best-effort. When eviction fails, the 60-second `s-maxage` is the upper bound, which is why Studio says a change reaches visitors "within a minute".
- Resolve's cache misses are rate limited per client network (60 a minute) through the shared fixed-window limiter.
- Mechanē's status machine, its schedule and its limits live in the issues (#817, #822), not here.
