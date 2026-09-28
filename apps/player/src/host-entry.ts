// How the Player's `/` decides what to show from the host it is served on
// (issue #831, ADR-0023). On the canonical Player host, `/` is the pairing
// code form. On any other host, a Custom Domain, it asks the API which
// Device lives there and opens that Device without changing the URL bar.
//
// The host is passed in rather than read from `window.location`, so the
// routing can be exercised with any host.

export type HostEntry =
  | { readonly kind: "canonical" }
  | { readonly kind: "device"; readonly pairingCode: string }
  | { readonly kind: "not_found" }
  | { readonly kind: "busy" };

/** The longest a rate-limited resolve waits before its one retry. */
export const MAX_RESOLVE_RETRY_WAIT_MS = 3_000;

/**
 * Whether `host` serves the Player itself rather than a Custom Domain: the
 * canonical Player origin's host, a bare `localhost` or loopback address in
 * development, or a Vercel deployment URL.
 */
export function isCanonicalPlayerHost(host: string, canonicalOrigin: string): boolean {
  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  return (
    host.toLowerCase() === new URL(canonicalOrigin).host ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".vercel.app")
  );
}

export interface ResolveHostDependencies {
  readonly canonicalOrigin: string;
  readonly apiBaseUrl: string;
  readonly fetch?: typeof fetch;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly signal?: AbortSignal;
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/**
 * What `/` shows on `host`. A 429 is retried once after its `Retry-After`,
 * capped at a few seconds; a second one, or no answer at all, is "busy".
 */
export async function resolveHostEntry(
  host: string,
  dependencies: ResolveHostDependencies,
): Promise<HostEntry> {
  if (isCanonicalPlayerHost(host, dependencies.canonicalOrigin)) return { kind: "canonical" };
  const request = dependencies.fetch ?? fetch;
  const sleep = dependencies.sleep ?? wait;
  const url = `${dependencies.apiBaseUrl}/api/player-domains/resolve?host=${encodeURIComponent(host)}`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await request(url, { credentials: "omit", signal: dependencies.signal });
    } catch {
      return { kind: "busy" };
    }
    if (response.status === 200) {
      const body: unknown = await response.json();
      return body && typeof body === "object" && "pairingCode" in body
        ? { kind: "device", pairingCode: String(body.pairingCode) }
        : { kind: "not_found" };
    }
    if (response.status !== 429) return { kind: "not_found" };
    if (attempt === 0) {
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      await sleep(
        Math.min(
          Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? retryAfterSeconds * 1000
            : 1000,
          MAX_RESOLVE_RETRY_WAIT_MS,
        ),
      );
    }
  }
  return { kind: "busy" };
}
