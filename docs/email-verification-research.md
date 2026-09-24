# Local email capture, pre-verified dev seeds, and sending from mechane.live

Research for [#759](https://github.com/fauxparse/mechane/issues/759).
Date: 2026-09-25. All claims cited to primary sources: official product docs, official provider pricing/help pages, and the Better Auth version actually installed in this repo (`better-auth@1.6.26`, verified against its shipped source in `apps/api/node_modules`). Prices/limits are as published on that date.

## The three questions

#759 needs (1) a Node equivalent of Rails' `letter_opener` — capture outgoing mail locally and view it, (2) dev seed accounts that are pre-verified without an email roundtrip, gated so this can never happen outside development, and (3) a free or cheap way for the deployed app to send as `noreply@mechane.live`, including DNS verification, free-tier limits, and whether a hosted mailbox is needed.

## Repo context (what this must fit)

- `apps/api` runs Better Auth (`better-auth` ^1.6.26) with the Drizzle/pg adapter. `src/auth.ts` enables email/password with `requireEmailVerification` (env-gated: `REQUIRE_EMAIL_VERIFICATION=false` disables it; default is required) and `emailVerification.sendOnSignUp` / `autoSignInAfterVerification` ([`apps/api/src/auth.ts`](../apps/api/src/auth.ts)).
- `src/lib/email.ts` is the single sending seam — today it only logs. Better Auth calls it from `sendVerificationEmail` and `sendResetPassword`; swapping its body is the whole integration ([`apps/api/src/lib/email.ts`](../apps/api/src/lib/email.ts)).
- The dev seed (`pnpm db:seed`) signs the default user up via `auth.api.signUpEmail`, then sets `emailVerified = true` with a direct SQL UPDATE. It begins by TRUNCATE-ing every auth table ([`apps/api/src/db/seeds.ts`](../apps/api/src/db/seeds.ts)).
- Dev infra is already docker-compose (postgres, minio, caddy, dnsmasq for `*.mechane.dev`); there is no mail container yet. `nodemailer` is not a dependency.

---

## 1. Local capture/preview: the letter_opener equivalents

Rails `letter_opener` intercepts outgoing mail in development and shows it in a browser — no delivery, no infrastructure. The Node options:

| Option | What it is | State | Fits this repo |
| --- | --- | --- | --- |
| **Mailpit** | Self-hosted SMTP catcher (Go single binary / Docker image) with web UI on :8025, REST API, search, HTML check, chaos mode | Actively maintained | ✅ Recommended |
| **MailHog** | The original Go SMTP catcher (SMTP :1025, UI :8025) | **No longer maintained** — stated by Mailpit's README citing [mailhog/MailHog#442](https://github.com/mailhog/MailHog/issues/442#issuecomment-1493415258); no active development or security updates for years | Skip |
| **Ethereal** | Hosted fake SMTP service built for Nodemailer (`nodemailer.createTestAccount()`); per-message preview URLs | Maintained (part of Nodemailer) | Viable fallback; requires internet and per-process credentials |
| **Nodemailer stream transport** | Returns the rendered message without any network; pairs with `preview-email` for a local HTML file | Maintained | Zero-dependency option for CI; no shared inbox UI |

Sources: [Mailpit docs/README](https://mailpit.axllent.org/) ([github.com/axllent/mailpit](https://github.com/axllent/mailpit) — "originally inspired by MailHog which is no longer maintained"); [MailHog README](https://github.com/mailhog/MailHog) (last release v1.0.1, 2020; SMTP 1025 / HTTP 8025 defaults); [Nodemailer SMTP testing / Ethereal](https://nodemailer.com/smtp/testing/) (accounts never deliver; `mxEnabled: false`; credentials rotate per process unless reused); [Nodemailer stream transport](https://nodemailer.com/transports/stream).

Why Mailpit over Ethereal for this repo:

- It is local and offline — dev already runs everything else in docker compose; one more service (`axllent/mailpit`, ports `1025` SMTP / `8025` UI) matches the existing Procfile/compose pattern, and Caddy could expose it at `mail.mechane.dev` like the other dev services.
- One shared, persistent inbox for all sends across restarts; Ethereal inboxes are per-account and each process run generates a new account unless credentials are saved ([Nodemailer docs](https://nodemailer.com/smtp/testing/)).
- Mailpit's REST API enables integration tests (list/search captured mail programmatically), and its chaos feature can simulate SMTP failures.

**Recommended setup (boring, one seam):** add a `mailpit` service to `docker-compose.yml`; add `nodemailer`; in `lib/email.ts`, when `SMTP_URL` is set, send through it (dev: `smtp://localhost:1025`), otherwise keep today's log-only behavior. Better Auth needs no changes — it already just calls `sendEmail`. With Mailpit in place, dev can keep `REQUIRE_EMAIL_VERIFICATION` on (the default) and click the real verification/reset links, which land in the Mailpit UI against the local dev server.

---

## 2. Better Auth: pre-verified seed users and gating

How verification actually works in the installed version (better-auth@1.6.26, cross-checked against the docs):

- `user.emailVerified` is a plain boolean on the `user` table. With `emailAndPassword.requireEmailVerification: true`, sign-in returns HTTP 403 until it is true, and each sign-in attempt re-triggers `sendVerificationEmail` ([docs: Email & Password](https://better-auth.com/docs/authentication/email-password)).
- The verification token is a **stateless HS256 JWT** signed with the app secret — `createEmailVerificationToken` is just `signJWT({ email, updateTo }, secret, expiresIn)` with a default `expiresIn` of 3600 seconds (installed source: `dist/api/routes/email-verification.mjs`). The `verification` table is **not** used for email verification in 1.6; it stores other tokens (e.g. password reset via `createVerificationValue`, `dist/db/internal-adapter.mjs`). Clicking `/verify-email?token=…` validates the JWT and then runs `updateUserByEmail(email, { emailVerified: true })`.
- Consequence for seeds: there is no token row to fabricate or orphan. A direct `UPDATE user SET email_verified = true` — exactly what `seeds.ts` does today — is indistinguishable from a completed verification. `autoSignInAfterVerification` only matters for the real click-through flow.
- Dev gotcha worth knowing: verification links expire after **1 hour** by default (`emailVerification.expiresIn`, default 3600s), so links fished out of old logs/Mailpit messages go stale.

Implications of pre-verified seeding:

- The seeded user skips the email flow entirely — correct for a dev fixture; it must never run against production. The existing seed is already self-gating: it is a local script (`pnpm db:seed`) whose first act is `TRUNCATE … "user" CASCADE`, so running it anywhere you care about destroys the data first. That is effectively a forced dev-only boundary, and it is the boring one to keep.
- Better Auth also offers a config-level route: `databaseHooks.user.create.before` can return `{ data: { ...user, emailVerified: true } }` ([docs: Database hooks](https://better-auth.com/docs/concepts/database)). That hook applies to **every** sign-up through the running server, so gating it with an env var risks a leaked/mis-set variable silently disabling verification in production. Prefer the seed-script path: it never touches auth config that ships to prod.
- `REQUIRE_EMAIL_VERIFICATION=false` (already in `auth.ts`) remains the deployment kill-switch for "no email provider wired yet." Once Mailpit + a real provider land, dev and prod can both keep verification required, and the flag becomes a pure emergency switch.
- To keep the real flow exercised in dev/tests, seed one *unverified* user as well (or rely on manual sign-up) and verify through the captured Mailpit message — Mailpit's [REST API](https://mailpit.axllent.org/docs/api-v1/) can fetch the message and extract the URL programmatically for integration tests.

---

## 3. Sending as `noreply@mechane.live` for free

Verification/reset mail is transactional. Gmail/Yahoo (since Feb 2024) and Microsoft (since May 2025) require authenticated bulk/transactional senders — SPF/DKIM/DMARC on the sending domain ([Brevo's sender-requirements help page](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders)). A hosted mailbox is **not** required to send; receiving replies/bounces can be handled for free (below).

### The options

| Provider | Free tier | Custom-domain sending | Notes |
| --- | --- | --- | --- |
| **Resend** | 3,000 emails/mo, **100/day cap**, 3 custom domains, 30-day retention | DNS: DKIM TXT + SPF TXT + return-path MX on a `send.` subdomain; optional one-click Cloudflare Domain Connect | Officially suggested by Better Auth docs |
| **Cloudflare Email Service** | Inbound routing: free, unlimited. Outbound **sending requires Workers Paid ($5/mo)**: 3,000/mo included, then $0.35/1k | Domain must be on Cloudflare DNS; onboarding auto-adds SPF/DKIM/DMARC + bounce MX | Sending is in beta; REST API and authenticated SMTP both available |
| **Brevo** | **300/day**, never expires | Domain auth (Brevo code + DKIM + DMARC records) or per-sender 6-digit email code | Free tier stamps "Sent with Brevo" on every email |
| **Postmark** | **100/mo** forever (Developer plan) | DKIM TXT "Sender Signature"; once DKIM verifies, any address on the domain can send | $15/mo for 10k beyond; 100/mo is tight for auth mail |
| **Gmail / Google Workspace** | None (14-day trial only) | Custom email requires a paid Workspace plan (per-user; e.g. Starter was listed at NZ$10.50/user/mo flex at time of writing — regional pricing varies) | `smtp.gmail.com` + app passwords is for @gmail.com accounts, not custom domains |
| **Zoho Mail (free)** | Hosted mailbox at custom domain, up to 5 users, 5 GB each | Yes (MX to Zoho); SMTP allowed for free-plan org users (`smtp.zoho.com` :465/:587) | New free accounts get **no IMAP/POP**; send limits are dynamic, reputation-based, rolling 1-hour; Zoho discourages automated sending |

Sources (all accessed 2026-09-25):

- Resend: [pricing](https://resend.com/pricing) (Free: 3,000/mo, 100/day, 3 domains, 30-day retention; DKIM/SPF/DMARC included on all plans); [verified domains](https://resend.com/docs/dashboard/domains/introduction) ("You must add and verify at least one domain to send emails with Resend"; after verification "send … using any email address at your domain without any extra configuration"); [add a domain](https://resend.com/docs/add-a-domain) (DKIM/SPF/MX records, subdomain recommended, verification usually ~15 min, up to 72 h); [Cloudflare setup guide](https://resend.com/docs/knowledge-base/cloudflare) (records live on `send.<domain>` and `resend._domainkey.<domain>`; one-click Domain Connect; don't proxy CNAMEs).
- Cloudflare: [Email Service overview](https://developers.cloudflare.com/email-service/) (Email Sending = **beta**, Workers Paid plan; Email Routing free; REST API + SMTP + Workers binding); [pricing](https://developers.cloudflare.com/email-service/platform/pricing/) (3,000/mo included on Workers Paid, $0.35/1k after; sends to verified destination addresses free on all plans; **Email Routing is inbound/routing only** — "route incoming emails", it does not send as your domain); [limits](https://developers.cloudflare.com/email-service/platform/limits/) (50 recipients/email, 5 MiB messages, conservative new-account daily quotas that grow with reputation); [send-emails setup](https://developers.cloudflare.com/email-service/get-started/send-emails/) ("You must be using Cloudflare DNS"; onboarding adds bounce MX + SPF/DKIM/DMARC TXT; SMTP endpoint `smtps://smtp.mx.cloudflare.net:465` with API-token auth).
- Brevo: [Free plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) (300 sends/day, no rollover, "Sent with Brevo" sticker); [domain authentication](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC) (Brevo code + DKIM + DMARC records; free-provider domains cannot be authenticated; up to 48 h); [sender creation](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email) (unauthenticated-domain senders verify via a 6-digit code emailed to the sender address — chicken-and-egg for `noreply@` unless you can receive there).
- Postmark: [pricing](https://postmarkapp.com/pricing) (Free Developer plan: 100 emails/mo, "never expires", no overages; Basic $15/mo from 10,000/mo); [DKIM setup](https://postmarkapp.com/support/article/1091-how-do-i-set-up-dkim-for-postmark) (TXT record; after DKIM verifies, the whole domain is verified and "you can send from any email address on the domain"; verification within 48 h).
- Google: [Workspace pricing](https://workspace.google.com/pricing/) (custom business email on every paid plan; 14-day trial; per-user pricing).
- Zoho: [Mail pricing](https://www.zoho.com/mail/zohomail-pricing.html) (Mail Free: "Custom email for one domain", up to 5 users, 5 GB/user; "IMAP/POP/Active Sync not included"); [IMAP/SMTP config](https://www.zoho.com/mail/help/imap-access.html) (free-org users: outgoing `smtp.zoho.com` :465 SSL / :587 TLS; IMAP not available to new free accounts) and [POP access](https://www.zoho.com/mail/help/pop-access.html); [rates & limits](https://www.zoho.com/mail/help/adminconsole/rates-and-limits.html) (limits are dynamic/reputation-based on a rolling 1-hour basis; free accounts lower than paid; automated/bulk sending discouraged).

### DNS / domain constraints for mechane.live

- Every provider requires proving control of the domain via DNS records (DKIM at minimum, plus SPF and increasingly DMARC). If `mechane.live`'s nameservers are on Cloudflare, Resend can add its records automatically ([Domain Connect](https://resend.com/docs/knowledge-base/cloudflare)); otherwise it is three copy-pasted records at any DNS host.
- Resend's records are scoped to the `send.` subdomain (MX, SPF TXT) and `resend._domainkey` (DKIM), so they do **not** collide with root-domain MX used for receiving ([Resend Cloudflare guide](https://resend.com/docs/knowledge-base/cloudflare)). Resend recommends a subdomain anyway for reputation isolation — e.g. send as `noreply@mechane.live` with records on `mechane.live`, or `no.mechane.live` if you want stricter isolation.
- Cloudflare Email Service is the one option with a hard DNS requirement: "You must be using Cloudflare DNS" ([docs](https://developers.cloudflare.com/email-service/get-started/send-emails/)).
- Receiving side: [Cloudflare Email Routing](https://developers.cloudflare.com/email-service/) is free and unlimited inbound — a catch-all on `mechane.live` can forward `noreply@` (plus anything else) to a personal inbox, which covers stray replies and lets you click provider verification codes. This requires the domain's MX records to point at Cloudflare (Cloudflare adds them during setup); a transactional sender's outbound records (above) are unaffected.

### Recommendation

- **Sending: Resend free tier** — 3,000/mo (100/day) dwarfs a single-product app's verification + password-reset volume; free tier includes custom domains (up to 3), DKIM/SPF/DMARC, REST API + SMTP relay, and it is the provider Better Auth's own docs point at ([docs: Email](https://better-auth.com/docs/concepts/email)). Integration stays inside `lib/email.ts`'s `sendEmail` (e.g. `from: "Mechanē <noreply@mechane.live>"` via the Resend SDK or SMTP). Brevo's 300/day is more headroom but every email carries "Sent with Brevo"; Postmark's 100/mo is too small; Gmail/Workspace costs money; Zoho is a mailbox, not an app pipeline (and actively discourages automated sending).
- **Receiving (replies/bounces): Cloudflare Email Routing** (free) if the domain's DNS is on Cloudflare — no hosted mailbox needed. If human mailboxes are ever wanted, Zoho Mail's free plan hosts up to 5 users at the domain; that is orthogonal to transactional sending.
- **Single-vendor alternative:** if `mechane.live` is already on Cloudflare DNS and $5/mo is acceptable, Cloudflare Email Service (Workers Paid) does both directions with 3,000 sends/mo included and zero third party — but outbound sending is in beta, and daily quotas for new accounts start conservative and grow with reputation ([limits](https://developers.cloudflare.com/email-service/platform/limits/)).

### Free-tier constraints to keep in mind

- Resend free: hard 100/day cap; 30-day message retention; 3 custom domains ([pricing](https://resend.com/pricing)).
- Brevo free: 300/day, no rollover; Brevo sticker on all mail ([help](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)).
- Cloudflare Email Service: outbound not available on the free plan at all (except sends to your own verified destination addresses, which are free on every plan — handy for dev testing); 3,000/mo included on Workers Paid, then $0.35/1k ([pricing](https://developers.cloudflare.com/email-service/platform/pricing/)).
- Postmark free: 100/mo total, no overage allowed ([pricing](https://postmarkapp.com/pricing)).
- Zoho free: SMTP works but limits are undisclosed, dynamic, and reputation-based; not a transactional pipe ([rates & limits](https://www.zoho.com/mail/help/adminconsole/rates-and-limits.html)).

---

## Summary of recommendations for #759

1. **Dev capture:** Mailpit as a docker-compose service; `lib/email.ts` sends via `SMTP_URL` (nodemailer) when set, logs otherwise. Keep `REQUIRE_EMAIL_VERIFICATION` on in dev and click real links from the Mailpit UI.
2. **Seeds:** keep the existing direct `emailVerified = true` update inside the dev-only, database-nuking seed script; do not add a `databaseHooks` auto-verify path to `auth.ts` (it would ship to prod and a leaked env var would silently disable verification). Optionally seed a second, unverified user to keep the verification flow exercised.
3. **Production sending:** Resend free tier from `noreply@mechane.live` (DNS-verified via DKIM/SPF records), plus free Cloudflare Email Routing catch-all for inbound if DNS is on Cloudflare. No hosted mailbox needed.
