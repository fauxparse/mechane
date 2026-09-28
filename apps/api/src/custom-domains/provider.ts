// The domains provider seam (issue #832): every fact from outside Mechanē
// that the Custom Domain checker, the owner operations and the admin
// operations need. The Ownership Proof lookup, the Player project's domains
// on Vercel, the HTTPS check and resolve's CDN cache all sit behind it, so
// the status machine never talks to DNS, Vercel or the network directly.
//
// `CUSTOM_DOMAINS_PROVIDER` picks the implementation: `vercel` in production,
// `local` (the default) in development, where every check passes unless
// `pnpm dev:domains` says otherwise. Tests use the in-memory fake.

/** A DNS record the user is asked to create. */
export interface DnsRecord {
  readonly type: "A" | "CNAME" | "TXT";
  /** Fully qualified record name, e.g. `_vercel.knifefight.nz`. */
  readonly name: string;
  readonly value: string;
}

/** The Player project's view of one of its domains. */
export interface ProjectDomain {
  readonly verified: boolean;
  /**
   * Challenges Vercel wants completed before it serves the domain, such as
   * a TXT record at `_vercel.<domain>` when another Vercel account holds the
   * hostname. Empty once verified.
   */
  readonly verification: readonly DnsRecord[];
}

/** How the hostname's DNS looks from the hosting provider. */
export interface DomainConfig {
  readonly misconfigured: boolean;
  /**
   * The A (apex) or CNAME (subdomain) record the user should create. It
   * comes from the provider, never from a constant: the CNAME target is
   * specific to the Player project.
   */
  readonly recommended: readonly DnsRecord[];
}

export type AddProjectDomainResult =
  | { readonly kind: "added"; readonly domain: ProjectDomain }
  /** Another hosting account holds the hostname and it can't be added. */
  | { readonly kind: "in_use_elsewhere" };

export type HttpsCheckResult =
  | { readonly ok: true }
  /** `reason` is shown to the user beside the remedy. */
  | { readonly ok: false; readonly reason: string };

/**
 * The hosting provider refused a write for exceeding its rate limit
 * (Vercel's `rate_limit_exceeded`). The checker backs off until `retryAt`.
 */
export class ProviderRateLimitedError extends Error {
  readonly retryAt: Date;

  constructor(retryAt: Date) {
    super(`The domains provider is rate limited until ${retryAt.toISOString()}.`);
    this.name = "ProviderRateLimitedError";
    this.retryAt = retryAt;
  }
}

export interface CustomDomainsProvider {
  readonly name: "local" | "vercel" | "fake";
  /**
   * Whether `.localhost` hostnames may be added. Only the local provider can
   * serve them; everywhere else they are reserved names.
   */
  readonly allowLocalhost: boolean;

  /** The TXT values published at `_mechane.<hostname>`, the Ownership Proof. */
  lookupOwnershipProof(hostname: string): Promise<readonly string[]>;

  /** Adds the hostname to the Player project. Throws `ProviderRateLimitedError`. */
  addProjectDomain(hostname: string): Promise<AddProjectDomainResult>;
  /** The project's view of the hostname, or null when it isn't in the project. */
  getProjectDomain(hostname: string): Promise<ProjectDomain | null>;
  getDomainConfig(hostname: string): Promise<DomainConfig>;
  /** Asks the provider to recheck its challenge. Throws `ProviderRateLimitedError`. */
  verifyProjectDomain(hostname: string): Promise<ProjectDomain>;
  /**
   * Detaches the hostname from the project and deletes it from the account.
   * A hostname that is already gone counts as removed.
   */
  removeProjectDomain(hostname: string): Promise<void>;
  /** Every hostname on the Player project, for reconciliation. */
  listProjectDomains(): Promise<readonly string[]>;

  /** Requests `https://<hostname>/` and reports whether it was served. */
  checkHttps(hostname: string): Promise<HttpsCheckResult>;

  /**
   * Evicts resolve's CDN responses carrying any of these cache tags
   * (cache-tags.ts). Best-effort: it never throws, and the 60-second expiry
   * still bounds a failure.
   */
  evictResolveCache(tags: readonly string[]): Promise<void>;
}

export type CustomDomainsProviderName = "local" | "vercel";

/**
 * Which provider the environment asks for. Production refuses to start with
 * anything but `vercel`, so a misconfigured deploy never serves the local
 * provider's always-passing checks.
 */
export function customDomainsProviderName(
  env: Record<string, string | undefined>,
): CustomDomainsProviderName {
  const requested = env.CUSTOM_DOMAINS_PROVIDER ?? "local";
  if (requested !== "local" && requested !== "vercel") {
    throw new Error(`CUSTOM_DOMAINS_PROVIDER must be "vercel" or "local", not "${requested}".`);
  }
  if (env.NODE_ENV === "production" && requested !== "vercel") {
    throw new Error("CUSTOM_DOMAINS_PROVIDER must be vercel when NODE_ENV=production.");
  }
  return requested;
}
