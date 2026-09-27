# Ingress and TLS provisioning for Custom Domains on the Player

Research for [Research ingress and TLS provisioning for Custom Domains](https://github.com/fauxparse/mechane/issues/815); input to the map [Custom Domains for the Player](https://github.com/fauxparse/mechane/issues/814).
Date: 2026-09-28. All external claims cite primary sources (Vercel docs, KB and REST API reference; Cloudflare developer docs and API reference; Let's Encrypt docs; Caddy docs), accessed 2026-09-28. Repo facts read from `main` at `c8a5e35`. Anything not grounded in a cited source is marked **[judgment]** or **[unverified]**.

## The question

Which ingress should serve the Player on arbitrary user-owned hostnames with automatically provisioned TLS, including apex domains — Vercel's Domains API on the Player project (the default under [ADR-0001](../blob/main/docs/adr/0001-cloud-hosted-no-local-server.md) and `docs/vercel-deployment-plan.html`), Cloudflare for SaaS custom hostnames fronting the Vercel Player, or a self-hosted on-demand-TLS proxy (Caddy `on_demand_tls` with an `ask` endpoint)? Compared below on: plan tier and per-project/account limits; cost per domain; apex support and exact DNS records; ownership verification and already-claimed domains; certificate issuance status via API (polling vs webhook, states, failure reasons); issuance latency; rate limits; removal semantics.

## Headline recommendation

**Vercel's project-domain APIs on the Player project, on the Pro plan.** It is the only option that needs no new infrastructure, no per-domain fee, and no second TLS/DNS system in front of the app: add each Custom Domain with `POST /v10/projects/{idOrName}/domains`, drive the TXT challenge if Vercel returns `verified: false`, poll `GET /v9/projects/{idOrName}/domains/{domain}` plus `GET /v6/domains/{domain}/config` until `verified: true` / `misconfigured: false`, and remove with the project-domain delete. Apex works with a plain A record; subdomains with a CNAME; certificates are Let's Encrypt HTTP-01, issued automatically, typically in minutes. Cloudflare for SaaS is the strongest status model (16 hostname states, 21 certificate states) and costs only $0.10/hostname/month after the first 100, but apex support is an Enterprise paid add-on, customers need a CNAME to a Cloudflare target, and Vercel explicitly recommends against proxies in front of its platform. Caddy on-demand TLS contradicts ADR-0001's no-servers posture, has no certificate-status API (we would build and own one), puts Let's Encrypt's account-wide rate limits in our blast radius, and — decisively — a self-hosted proxy in front of Vercel only gets first-class treatment (Verified Proxy Advanced) on Enterprise.

## Comparison

| Axis                   | Vercel Domains API on Player project                                          | Cloudflare for SaaS fronting Vercel                                                     | Self-hosted Caddy `on_demand_tls`                                                      |
| ---------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Plan tier              | Pro ($20/mo) for unlimited domains; Hobby caps at 50/project                  | Free zone plan suffices; apex needs Enterprise add-on                                   | Vercel Enterprise for Verified Proxy Advanced if fronting Vercel; plus a server we run |
| Per-domain cost        | $0 for externally owned domains                                               | $0 for first 100 hostnames, then $0.10/hostname/month                                   | $0 per domain; server cost; our ACME-account risk                                      |
| Domain ceiling         | Unlimited on Pro (soft limit 100,000/project)                                 | 50,000 hostnames max (non-Enterprise)                                                   | Bounded by Let's Encrypt limits and our ops, not a quota                               |
| Apex                   | Yes — A record (card value, often `76.76.21.21`)                              | Enterprise-only apex proxying (or customer DNS already flattens)                        | Yes — any A/AAAA to our IP                                                             |
| User DNS records       | CNAME (subdomain) / A (apex); TXT `_vercel` only if claimed                   | CNAME to our CNAME target; TXT tokens for pre-validation                                | A/AAAA to our server                                                                   |
| Ownership proof        | TXT `_vercel.<domain>` challenge from API                                     | TXT `_cf-custom-hostname.<hostname>` + CNAME/HTTP checks                                | Our own `ask` endpoint decision                                                        |
| Already claimed        | `domain_already_in_use` / 403 / 409 → TXT proof; use without moving ownership | Multiple providers may hold the same hostname; DNS target decides routing               | Ours to define                                                                         |
| Status via API         | `verified` bool + `verification[]`; domain `misconfigured` bool; poll only    | `status` (16 states) + `ssl.status` (21 states) + error arrays; poll (PATCH to recheck) | None built in — we build one                                                           |
| Issuance latency       | Cert "5 to 10 minutes" typically                                              | Validation retries: first 10 checks ≤ 20 min; 75 tries over 7 days                      | First handshake held "usually only a few seconds"                                      |
| Provider rate limits   | 100 domain writes/min (owner); 500 gets/min; 60 deletes/min                   | 1,200 API calls/5 min global; 200/s per IP                                              | (we are the client of LE; see below)                                                   |
| Let's Encrypt exposure | Vercel's ACME account, not ours                                               | Default CA is Cloudflare-managed (LE/Google/DigiCert selectable on Enterprise)          | Our account: 300 orders/3h, 5 failed validations/identifier/hour                       |
| Removal                | Project-domain delete (+ optional account-level delete)                       | DELETE hostname; or auto `Moved` → `Deleted` after 7 days                               | Ours (allowlist + cert cleanup)                                                        |
| ADR-0001 fit           | Native                                                                        | Extra zone + proxy Vercel recommends against                                            | New always-on server — contradicts it                                                  |

## Option A — Vercel Domains API on the Player project

### Limits and plan tier

- **Domains per project: Hobby 50; Pro "Unlimited\*"; Enterprise "Unlimited\*"** — the asterisk is a soft limit of 100,000 domains per project on Pro and 1,000,000 on Enterprise, "flexible and can be increased upon request" ([Vercel Limits: Domains](https://vercel.com/docs/limits#domains), last updated 2026-09-16; repeated in [Multi-tenant Limits](https://vercel.com/docs/platforms/multi-tenant-platforms/limits)).
- Custom SSL certificate upload and multi-tenant preview URLs are Enterprise-only ([Multi-tenant Limits](https://vercel.com/docs/platforms/multi-tenant-platforms/limits)); neither is needed here.
- The docs frame this flow as first-class: "In a multi-tenant platform, one Vercel project serves many tenants. Add each tenant hostname as a project domain so it follows the project's current production deployment" ([Multi-tenant Reference](https://vercel.com/docs/platforms/multi-tenant-platforms/reference)).

### Cost

- Hobby $0/mo, Pro $20/mo per user ([Vercel pricing](https://vercel.com/pricing)). The domains documentation lists **no per-domain charge for externally registered domains**; fees exist only for domains bought through Vercel, where "the price of available domains is the same as the registrar's pricing" ([Working with domains](https://vercel.com/docs/domains/working-with-domains)), and Pro includes one free first-year domain ([Pro plan](https://vercel.com/docs/plans/pro-plan)). So the marginal cost of a Custom Domain is $0; the real cost is the Pro plan that removes the 50-domain Hobby cap.

### Apex support and the exact DNS records

From [Adding & Configuring a Custom Domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain) and the KB guide [Can I use my domain on Vercel with A records?](https://vercel.com/kb/guide/a-record-and-caa-with-vercel) (updated 2026-07-28):

- **Subdomain** (e.g. `vote.knifefight.nz` under `knifefight.nz`): **CNAME** to the target shown in the project's domain card. Targets are now per-project, e.g. `d1d4fc829fe7bc7c.vercel-dns-017.com`; copy the value including the trailing dot.
- **Apex** (`knifefight.nz`): **A** record to the value shown in the domain card — "for most projects that value is `76.76.21.21`, a general-purpose anycast address. Newer projects draw a value from a pool of anycast IPs … such as `216.198.79.1`. The card is the source of truth." An apex can't be a CNAME (DNS spec, RFC 1034 §3.6.2, as Vercel's docs note), and ALIAS/ANAME records add nothing on Vercel because the A value is already anycast.
- **No IPv6**: Vercel doesn't support AAAA for custom domains from third-party DNS; leftover AAAA records split traffic and stall certificate provisioning ([KB](https://vercel.com/kb/guide/a-record-and-caa-with-vercel), [Troubleshooting](https://vercel.com/docs/domains/troubleshooting)).
- **CAA**: if the user has a restrictive CAA policy it must authorize `letsencrypt.org` (`0 issue "letsencrypt.org"`), or issuance fails; CAA lookups follow the CNAME alias ([Troubleshooting: Missing CAA records](https://vercel.com/docs/domains/troubleshooting#missing-caa-records)).
- Wildcard domains need Vercel nameservers or `_acme-challenge` NS delegation ([add-a-domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain)) — irrelevant here, since every Custom Domain is a name the user owns outright.

### Ownership verification and already-claimed domains

- Adding a domain the user does not control is blocked: "A domain can only be associated with _one_ Personal Account or Team at a time" ([Troubleshooting: Domain ownership errors](https://vercel.com/docs/domains/troubleshooting#domain-ownership-errors)). Documented error texts: `This team has already registered this domain`, `You have already registered this domain`, `The domain mydomain.com is not available` / `Another Vercel account is using this domain`. REST equivalents: 403 "You don't have access to the domain you are adding", 409 "The domain is already assigned to another Vercel project" ([Add a Domain to a Project](https://vercel.com/docs/rest-api/projects/add-a-domain-to-a-project)), plus SDK error codes `domain_already_in_use`, `invalid_domain`, `forbidden`, `rate_limit_exceeded` ([Multi-tenant Reference](https://vercel.com/docs/platforms/multi-tenant-platforms/reference#error-codes)).
- The API response returns `verified: false` plus a `verification` array of challenges: "A list of verification challenges, one of which must be completed to verify the domain for use on the project … If `verification.type = TXT` the `verification.domain` will be checked for a TXT record matching `verification.value`" ([Get a Project Domain schema](https://vercel.com/docs/rest-api/projects/get-a-project-domain)). In practice the record is a TXT at `_vercel.<domain>` with a `vc-domain-verify=…` value; Vercel's own troubleshooting says `dig TXT _vercel.tenant1.com` ([Multi-tenant Reference](https://vercel.com/docs/platforms/multi-tenant-platforms/reference), [KB](https://vercel.com/kb/guide/a-record-and-caa-with-vercel)).
- Two documented outcomes after proving ownership: dashboard "Connect External" — "Once verified, the domain will automatically transfer to your account" ([Troubleshooting](https://vercel.com/docs/domains/troubleshooting#domain-ownership-errors)) — versus project-level TXT verification — "this will not move the domain into your account, but will allow you to use it in your project" ([add-a-domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain#verify-domain-access)). For Mechanē the project-level flow is the right shape: we never want to _take over_ a user's domain, only serve it on the Player project.

### Certificate issuance and status via API

- Flow per [Multi-tenant Reference](https://vercel.com/docs/platforms/multi-tenant-platforms/reference): `addProjectDomain` → if `verified: false`, give the tenant the returned `verification` challenge → `verifyProjectDomain` (`POST /projects/:idOrName/domains/:domain/verify`) → poll `getProjectDomain` / `getProjectDomains` → `removeProjectDomain` to detach.
- Certificates: "Vercel uses LetsEncrypt for certificates. For all non-wildcard domains, we use the HTTP-01 challenge method … our infrastructure will deal with it" — issued automatically for every added domain once DNS validates, and renewed automatically "14 to 30 days before they expire" ([Working with SSL Certificates](https://vercel.com/docs/domains/working-with-ssl)).
- **Status surface (polling only):**
  - `GET /v9/projects/{idOrName}/domains/{domain}` → `verified: boolean` and the `verification[]` challenges ([Get a Project Domain](https://vercel.com/docs/rest-api/projects/get-a-project-domain)).
  - `GET /v6/domains/{domain}/config` → `{ misconfigured: boolean }`, with optional `projectIdOrName` and `strict` (nameserver inheritance) parameters ([Get a Domain's configuration](https://vercel.com/docs/rest-api/domains/get-a-domain-s-configuration)).
  - There is **no dedicated certificate-status resource and no domain webhook**: configurable webhooks cover Deployment, Project, Feature Flag and Firewall event categories only, and account-level webhooks are Pro/Enterprise features ([Webhooks](https://vercel.com/docs/webhooks)). So Studio's "certificate not yet issued" state is a poll of the two endpoints above.
- **Failure reasons** (dashboard "Invalid Configuration" / stuck certificate): conflicting or stale A/AAAA/CNAME records; AAAA to another host; CAA not permitting Let's Encrypt; a redirect/rewrite on `/.well-known/acme-challenge/`; a stale `_acme-challenge` TXT from a previous provider; a Cloudflare orange-cloud proxy in front ([Troubleshooting](https://vercel.com/docs/domains/troubleshooting), [KB](https://vercel.com/kb/guide/a-record-and-caa-with-vercel)). The API exposes these only as `misconfigured: true` / `verified: false` — diagnosing specifics is our job (or Vercel's dashboard's).

### Issuance latency

- "Wait 5 to 10 minutes for certificate issuance" and "wait 5 to 10 minutes after adding TXT record" ([Multi-tenant Reference troubleshooting](https://vercel.com/docs/platforms/multi-tenant-platforms/reference)); certificates complete "usually within a few minutes" ([KB](https://vercel.com/kb/guide/a-record-and-caa-with-vercel)). DNS propagation dominates: record changes "typically propagate quicker" but nameserver changes can take 24–48 hours ([Troubleshooting](https://vercel.com/docs/domains/troubleshooting#dns-record-propagation-times)). At platform scale Vercel markets programmatic SSL "provisions in under 5 seconds" ([multi-tenant solutions](https://vercel.com/solutions/multi-tenant-saas)) — treat as best case, not a promise.

### Rate limits

From the [rate limits table](https://vercel.com/docs/limits#rate-limits) (all per 60 s): **project domain creation/update/removal 100/min (owner scope)**, **project domain verification 100/min (user scope)**, **project domain GETs 500/min**, and **60 domain deletions per 60 s**. Caution: the [Multi-tenant Limits](https://vercel.com/docs/platforms/multi-tenant-platforms/limits#rate-limits) page states different, lower figures — "Domain addition: 100 requests per hour per team; Domain verification: 50 requests per hour per team; Domain removal: 100 requests per hour per team." The two pages disagree **[unverified which is current]**; a poller designed to the stricter figure is safe either way. Let's Encrypt limits apply to Vercel's issuance but on Vercel's ACME accounts, not ours.

### Removal semantics

- `removeProjectDomain` "does not remove account-level domain ownership"; `domainsDeleteDomain` "removes it from your account entirely" — Vercel's own multi-tenant example issues both on churn ([Configuring Custom Domains: Deleting or removing domains](https://vercel.com/docs/platforms/multi-tenant-platforms/configuring-domains#deleting-or-removing-domains)). Deleting is cheap and separate: the 60-deletions/min rate-limit example is explicitly about domain deletion ([Limits](https://vercel.com/docs/limits)).
- Nothing in the docs describes automatic cleanup of DNS records or certificates on removal (they're the user's records); the domain simply stops routing.

## Option B — Cloudflare for SaaS custom hostnames fronting the Vercel Player

### Setup shape

Enable Cloudflare for SaaS on a zone (a Free-plan zone is fine: "Add your zone to Cloudflare on a Free plan"), create a **proxied fallback origin** record, optionally a friendlier **CNAME target** like `customers.saasprovider.com`, then create custom hostnames via `POST /zones/{zone_id}/custom_hostnames` ([Getting started](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/)). Traffic flows customer hostname → CNAME target → fallback origin.

### Limits and cost

- "Hostnames included: 100" on every plan; "Max hostnames: 50,000" (non-Enterprise; Enterprise unlimited-ish); **"$0.10 per additional hostname"** per month on Free/Pro/Business ([Plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/), updated 2026-08-14).
- Selectable CA, custom certificates, wildcard custom hostnames, mTLS are Enterprise-only ([Plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/)). None needed here — but note wildcard custom hostnames being Enterprise-only forecloses a "many subdomains of the user's zone via one hostname" shortcut.

### Apex support and DNS records

- Default customer record: **CNAME `<hostname>` → our CNAME target** (e.g. `mystore.example.com CNAME customers.saasprovider.com`) ([Getting started](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/#3-have-customer-create-cname-record)).
- **Apex is not supported by default**: "If your customer needs to use an A record to point to the SaaS target, you will need to get apex proxying. By default, using an A record to point to the target is not a supported setup" ([Getting started](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/#3-have-customer-create-cname-record)). Apex proxying assigns static IP prefixes (or BYOIP) and is a **paid Enterprise add-on** ([Apex proxying](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/apex-proxying/), [Plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/)).
- The one non-Enterprise apex escape hatch: a customer whose DNS is already on Cloudflare can put the CNAME at their apex, because "Cloudflare offers this functionality through CNAME flattening" ([Apex proxying footnote](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/apex-proxying/)). Users on other providers would need ALIAS/flattening support **[judgment: provider-dependent, not guaranteed by us]**.
- Optional pre-validation records: TXT `ownership_verification` (name `_cf-custom-hostname.<hostname>`) and/or `_acme-challenge.<hostname>` TXT for the certificate (see below).

### Ownership verification and already-claimed domains

Two independent validations, with different tokens and API fields ([Hostname validation](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/)):

- **Hostname validation** → `result.status`: via `ownership_verification` TXT (`_cf-custom-hostname.<hostname>` = UUID), an HTTP token under `/.well-known/cf-custom-hostname-challenge/…`, or real-time validation that fires once the customer's CNAME points at us.
- **Certificate validation** → `result.ssl.status`: `ssl.method` is one of `http`, `txt`, `email`; TXT tokens land as `_acme-challenge.<hostname>` records from `ssl.validation_records` ([TXT validation](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/security/certificate-management/issue-and-validate/validate-certificates/txt/), response example included).

Already-claimed is structurally different from Vercel: "Multiple SaaS providers can hold an active custom hostname for the same domain simultaneously. Cloudflare routes traffic based on where the DNS CNAME points" ([Hostname validation](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/)); there's a documented zero-downtime migration path from another SaaS provider (pre-validate → issue cert → then switch DNS). But hostnames that use another CDN are incompatible ("hostname validation will fail"), and a `Blocked` status exists for hostnames "likely associated with Cloudflare previously and flagged for abuse" ([Validation status](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/validation-status/)).

### Certificate status API, states, failure reasons

- The custom-hostname object exposes `status` (hostname activation) and `ssl.status` (certificate), with `verification_errors[]` (activation) and `ssl.validation_errors[]` (CA-reported, e.g. `"SERVFAIL looking up CAA for app.example.com"`) in the response ([Create Custom Hostname schema](https://developers.cloudflare.com/api/resources/custom_hostnames/methods/create/)). A `PATCH` with the same `ssl` object forces a revalidation pass ([Validation status: Refresh validation](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/validation-status/)).
- **Hostname `status` values** (API enum, 16): `active`, `pending`, `active_redeploying`, `moved`, `pending_deletion`, `deleted`, `pending_blocked`, `pending_migration`, `pending_provisioned`, `test_pending`, `test_active`, `test_active_apex`, `test_blocked`, `test_failed`, `provisioned`, `blocked` ([Create Custom Hostname schema](https://developers.cloudflare.com/api/resources/custom_hostnames/methods/create/)); the doc table covers the user-facing six: Pending, Active, Active re-deploying, Blocked, Moved, Deleted ([Validation status](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/validation-status/)).
- **`ssl.status` values** (API enum, 21): `initializing`, `pending_validation`, `pending_issuance`, `pending_deployment`, `active`, `pending_deletion`, `pending_expiration`, `expired`, `initializing_timed_out`, `validation_timed_out`, `issuance_timed_out`, `deployment_timed_out`, `deletion_timed_out`, `pending_cleanup`, `staging_deployment`, `staging_active`, `deactivating`, `inactive`, `backup_issued`, `holding_deployment` (+`deleted`) ([Create Custom Hostname schema](https://developers.cloudflare.com/api/resources/custom_hostnames/methods/create/)); lifecycle narrative: Initializing → Pending Validation → Pending Issuance → Pending Deployment → Active ([Certificate statuses](https://developers.cloudflare.com/ssl/reference/certificate-statuses/)).
- Readiness: "treat a custom hostname as ready when `result.status` is `active`, `result.ssl.status` is `active`, and DNS points to your SaaS target" — and the details endpoint is "the source of truth for onboarding state" ([Certificate statuses: SSL for SaaS](https://developers.cloudflare.com/ssl/reference/certificate-statuses/)).
- Documented validation error causes: no fallback origin set; fallback origin not active; "Custom hostname does not CNAME to this zone" (i.e. missing apex entitlement); ownership token not found ([Error codes](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/error-codes/)).
- CAs: default CA chosen by Cloudflare; `lets_encrypt`, `google`, `digicert`, `ssl_com` selectable — Enterprise only ([Create Custom Hostname schema](https://developers.cloudflare.com/api/resources/custom_hostnames/methods/create/)). Renewals for non-wildcard hostnames use automatic HTTP DCV "as long as: the hostname is pointing to the SaaS provider [and] proxying through the Cloudflare network" ([Validate](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/security/certificate-management/issue-and-validate/validate-certificates/)).

### Issuance latency

- Hostname validation is retry-driven: 75 attempts spread over seven days; "The first 10 checks complete within 20 minutes and most checks complete in the first four hours"; retry gaps grow to a 4-hour cap ([Backoff schedule](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/backoff-schedule/)). After the schedule runs out unvalidated the hostname goes `Moved`, and `Deleted` after 7 days `Moved` ([Validation status](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/validation-status/)).
- Certificate DCV tokens are "ready after a few seconds" ([TXT validation](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/security/certificate-management/issue-and-validate/validate-certificates/txt/)); with automatic HTTP validation the cert activates after DNS cutover on the same retry cadence — Cloudflare warns of "a short downtime window while the hostname activates or the certificate moves to Active" ([Getting started caution](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/#3-have-customer-create-cname-record)). No blanket "certificates issue in N minutes" figure is published **[unverified]**.

### Rate limits

- Cloudflare API: **1,200 requests per 5 minutes per user/account token (global, cumulative), 200/s per IP**, HTTP 429 when exceeded; Enterprise can raise ([API rate limits](https://developers.cloudflare.com/fundamentals/api/reference/limits/)).

### Removal semantics

- `DELETE /zones/{zone_id}/custom_hostnames/{id}` removes the hostname and issued certificates ([Remove custom hostnames](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/remove-custom-hostnames/)).
- Automatic path: if the customer repoints DNS, the hostname enters `Moved` and after seven days transitions to `Deleted`. Cloudflare explicitly advises providers to delete churned hostnames anyway, because priority logic can keep routing ([Remove custom hostnames](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/remove-custom-hostnames/)).

### The fronting-Vercel problem

Vercel's position: "**We do not recommend** placing a reverse proxy server in front of your Vercel project" — it blinds Vercel's firewall, hides client IPs, and forwards proxy attacks to us as usage ([Reverse Proxy Servers and Vercel](https://vercel.com/docs/security/reverse-proxy)). Cloudflare is nonetheless a supported "Verified Proxy Lite" provider (`CF-Connecting-IP`, automatic enablement); Flexible SSL must be avoided (redirect loops — use Full (strict)); `/.well-known/acme-challenge/*` must stay reachable on port 80 and `/.well-known/vercel/*` uncached ([Reverse Proxy](https://vercel.com/docs/security/reverse-proxy), [Cloudflare with Vercel KB](https://vercel.com/kb/guide/cloudflare-with-vercel)). Routing-wise, Vercel serves Host-based: every hostname served through Cloudflare would still have to be known to the Vercel project, or the proxy would have to rewrite the Host/SNI to a Vercel-registered name **[judgment — grounded in the reverse-proxy doc's requirement for "consistent and predictable Vercel project domains"; not documented for the Lite flow]**. That means Option B likely duplicates domain bookkeeping in two systems.

## Option C — self-hosted on-demand-TLS proxy (Caddy)

### Mechanics

- "On-Demand TLS … dynamically obtains a new certificate during the first TLS handshake that requires it, rather than at config load. Crucially, this does **not** require hard-coding the domain names in your configuration ahead of time … The delay is usually only a few seconds, and only that initial handshake is slow" ([Automatic HTTPS: On-Demand TLS](https://caddyserver.com/docs/automatic-https#on-demand-tls)).
- Enabling per-site is `tls on_demand`, which carries a security warning: "Doing so in production is insecure unless you also configure the `on_demand_tls` global option to mitigate abuse" ([tls directive](https://caddyserver.com/docs/caddyfile/directives/tls)). The global option is `on_demand_tls { ask <endpoint>; permission <module> }` ([Global options](https://caddyserver.com/docs/caddyfile/options)); "The primary restriction is an 'ask' endpoint to which Caddy will send an HTTP request to ask if it has permission to obtain and manage a certificate for the domain in the handshake … query the accounts table of your database and see if a customer has signed up with that domain name" ([On-Demand TLS: Using](https://caddyserver.com/docs/automatic-https#using-on-demand-tls)). The `ask` endpoint is exactly the "proof of DNS control before a domain goes live" hook the map's abuse posture wants — but note it gates certificate issuance, not DNS control.
- Certificates come from "a public ACME CA such as Let's Encrypt or ZeroSSL" by default; requirements: domain A/AAAA → our IP, ports 80/443 open, persistent writable data storage ([Automatic HTTPS](https://caddyserver.com/docs/automatic-https)). Renewals run in the background automatically.

### The Let's Encrypt exposure we would own

Current limits ([Rate Limits](https://letsencrypt.org/docs/rate-limits/), updated 2026-08-05):

- **New Orders per Account: 300 per 3 hours** (one ACME account shared by every Mechanē Custom Domain).
- **New Certificates per Registered Domain: 50 per 7 days** — global across all accounts, but applies per _user's_ domain, so it rarely binds us; each user's hostname is its own registered domain.
- **New Certificates per Exact Set of Identifiers: 5 per 7 days** (global) — re-provisioning the same hostname repeatedly trips this.
- **Authorization Failures: 5 per identifier per account per hour**, and 1,152 consecutive failures pauses issuance for the identifier (self-service unpause).
- ARI-coordinated renewals are exempt from all limits; non-ARI renewals are exempt from the 50/7-day and 300/3-hour limits.
- Consequences: a misconfigured retry loop (a user pointing DNS before our `ask` allowlist is right) burns _our_ account-wide budget, and there is no provider to call — we'd be the ones filing override requests.

### Everything else is ours to build

- **No certificate-status API**: Caddy exposes nothing like Vercel's `verified` or Cloudflare's `ssl.status`; Studio's status model, polling, failure reasons, and revocation tooling would all be hand-built against our own database plus Caddy's admin endpoint **[judgment]**.
- **Ownership verification**: the `ask` endpoint is only as trustworthy as we make it; proving _DNS_ control (as the map requires) means building our own TXT-token check before allowing a hostname, on top of Caddy's ask gate.
- **Removal**: dropping the hostname from the allowlist stops new issuance; deleting cached certificates and handling in-flight renewals is manual.
- **ADR-0001 conflict and the Vercel fronting problem**: this is a second, always-on piece of infrastructure to run (contra [ADR-0001](../blob/main/docs/adr/0001-cloud-hosted-no-local-server.md)). Proxying a Vercel backend with it hits the same reverse-proxy caveats as Option B but worse: self-hosted proxies are not in Vercel's supported Verified Proxy Lite provider list, and "any other provider or a self-hosted proxy … requires a manual onboarding process (Enterprise only)" for Verified Proxy Advanced (static egress IPs, custom client-IP header, SNI on outbound TLS) ([Reverse Proxy](https://vercel.com/docs/security/reverse-proxy)). On Hobby/Pro only Verified Proxy Lite is available at all.

## Recommendation for Mechanē

**Use the Vercel project-domain APIs on the Player project, on the Pro plan.** The deciding facts:

1. **It is the platform we're already on.** No new zone, no fallback origin, no server, no second cert lifecycle — consistent with ADR-0001 and with the multi-tenant flow Vercel documents for exactly this use case ([Multi-tenant Reference](https://vercel.com/docs/platforms/multi-tenant-platforms/reference)).
2. **Apex is first-class via a plain A record.** Cloudflare for SaaS makes apex an Enterprise paid add-on and CNAMEs the only default customer record — a real regression for `knifefight.nz`-style Custom Domains ([Cloudflare apex proxying](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/apex-proxying/)).
3. **Cost and ceiling fit.** $0 per externally owned domain; unlimited on Pro with a 100,000/project soft limit ([Vercel Limits](https://vercel.com/docs/limits#domains)) — versus Cloudflare's $0.10/hostname/month after 100 and 50,000 hard max, or Caddy's unbounded-but-ours-to-operate.
4. **Both alternatives put a proxy in front of Vercel that Vercel recommends against**, and the self-hosted one only gets proper client-IP treatment on Enterprise ([Reverse Proxy](https://vercel.com/docs/security/reverse-proxy)).

What we accept with Vercel: a coarse status surface (`verified` + `misconfigured`, no per-failure-reason enum, no webhooks — poll), issuance measured in minutes, and a docs discrepancy on API rate limits to design around.

### Facts later tickets depend on

**DNS records Studio will show users** (values come from the project's domain card / the add-domain response — nothing is deployed yet, so the exact per-project CNAME target is only knowable once the Player project exists in Vercel):

| Case                                                 | Record                                                                                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subdomain `vote.knifefight.nz`                       | `CNAME vote → <project CNAME target>` — per-project value from the domain card, e.g. `d1d4fc829fe7bc7c.vercel-dns-017.com` (trailing dot included) |
| Apex `knifefight.nz`                                 | `A @ → <card value>` — `76.76.21.21` for most projects, or a per-project anycast IP like `216.198.79.1`                                            |
| Domain claimed by another Vercel account (only then) | `TXT _vercel.<domain> → vc-domain-verify=…` challenge from the API's `verification[]`                                                              |
| Preconditions                                        | No AAAA records (IPv6 unsupported); CAA (if any) must allow `letsencrypt.org`                                                                      |

**Status states the API exposes**: project-domain `verified: boolean` + `verification[]` challenges (`GET /v9/projects/{idOrName}/domains/{domain}`), and domain `misconfigured: boolean` (`GET /v6/domains/{domain}/config`). No certificate object, no domain webhooks — Studio polls. Issuance is Let's Encrypt HTTP-01, automatic on add, typically 5–10 minutes after DNS validates.

**Hard limits bounding the per-user cap**: Hobby's 50-domains-per-project cap forces Pro; Pro is unlimited with a 100,000/project soft limit (Enterprise 1,000,000). API budget: 100 domain writes/min and 100 verifies/min (500 reads/min) per the main limits page, but 100 adds / 50 verifies / 100 removals **per hour** per the multi-tenant page — assume the stricter. A per-user cap of a few domains is therefore bounded by product judgement, not by Vercel's quotas, until ~tens of thousands of domains.

## Residual fog / new questions

- **Exact CNAME target for our Player project** (per-project anycast value vs the classic shared `cname.vercel-dns.com`) is only observable once the project exists in Vercel — the domain card is the source of truth. Belongs in the implementation ticket.
- **Vercel rate-limit discrepancy** (per-minute vs per-hour figures across two docs pages) — unverified which is current; the poller should assume the lower and back off on `rate_limit_exceeded`.
- **CORS is untouched by this choice**: whichever ingress serves the Player origin, the API's exact-origin allowlist and Better Auth `trustedOrigins` must learn per-domain origins (already recorded in the map's charting notes) — ingress choice doesn't remove that work.
- **Cloudflare-proxied user DNS**: a user whose DNS sits behind Cloudflare's orange cloud will fail Vercel's HTTP-01 verification unless the record is DNS-only (or SSL mode is Full) — worth an explicit Studio troubleshooting note ([KB](https://vercel.com/kb/guide/a-record-and-caa-with-vercel), [Troubleshooting](https://vercel.com/docs/domains/troubleshooting)).
- Nothing encountered here suggests scope beyond the map's Destination or its Out-of-scope list; billing for Custom Domains stays out (Pro plan cost is platform overhead, not per-user billing).
