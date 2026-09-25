# Does a Build Output route `/api/(.*)` → `/api` preserve the original path in `req.url`?

Research artifact for issue #762 (bundle API for Vercel). Primary sources only; researched 2026-09-25.

## Question

A Build Output API v3 `config.json` route (or the equivalent `vercel.json` rewrite):

```json
{ "src": "/api/(.*)", "dest": "/api" }
```

routes every `/api/...` request to the Node.js function at `/api`. When that function runs,
is `req.url` the **original** request path (`/api/foo/bar`) or the **destination** path (`/api`)?

## Conclusion

**For a regular (non-prerender) Node.js function, `req.url` preserves the original request path; the
`dest` only selects which function handles the request.** Confidence: high. The exact scenario is
directly attested by a Vercel maintainer-confirmed GitHub discussion (2022) and matches the routing
model in current official docs; however, the docs' explicit "receives the original path" sentence is
written for Services, and platform behavior here is documented only to the level quoted below — treat
it as strongly evidenced, not contractually specified, and don't couple the bundled router's dispatch
to `req.url` (see "Safest pattern").

## Direct evidence

1. **Exact scenario, Vercel maintainer confirmed** — vercel/vercel discussion #8329 (Aug 2022):
   Build Output v3 routes `{"src": "/direct/(.*)", "dest": "/direct"}` and `{"src": "/(.*)", "dest": "/default"}`.
   The reporter: *"my `/direct` function just gets the original `src` URL like I would want/expect"*; only the
   **prerender** function (`default.func` + `default.prerender-config.json`) got `req.url === "/default"`.
   Vercel maintainer TooTallNate: *"I do agree though that this is inconsistent behavior compared to how a
   'regular' Serverless Function behaves, and I would like to have that discrepancy be fixed."*
   https://github.com/vercel/vercel/discussions/8329

2. **Routing model: destination = selection, observed path is separate** — `vercel.json` docs,
   "Request path transform": *"The `request.path` transform overrides the path that the target runtime
   observes for a request. This is the URL path your Function reads from `req.url`. It does not change
   route selection or the destination... Adjusting the path and rewriting are separate steps."*
   Example: *"A request to `/articles/42` reaches the same destination, but the Function reads
   `/posts/42` from `req.url`"* (i.e., the function observes the transform value, not the destination).
   https://vercel.com/docs/project-configuration/vercel-json

3. **Same model stated explicitly for Services** — Services routing docs: *"The service receives the
   original request path. `GET /api/users` reaches `my_backend` as `/api/users`, not `/users`"* and
   *"the destination `path` only selects which route runs... not the path your code sees. To change the
   path your service code observes, add a `request.path` transform."*
   https://vercel.com/docs/services/routing

4. **The rewrites-docs line that looks contradictory is about `dest`, not `req.url`** —
   "This converts a request like `/resize/800/600` to `/api/sharp?width=800&height=600`"
   (https://vercel.com/docs/routing/rewrites) describes the **destination value**: running the first-party
   `@vercel/routing-utils` `getTransformedRoutes()` shows `{"source":"/resize/:width/:height","destination":"/api/sharp"}`
   compiles to `dest: "/api/sharp?width=$1&height=$2"` (unused source params are appended to the dest query).
   Same run: `{"source":"/api/(.*)","destination":"/api"}` compiles to
   `[{"handle":"filesystem"},{"src":"^/api(?:/(.*))$","dest":"/api","check":true}]` — confirming
   `rewrites` ≡ Build Output `routes` `src`/`dest`. https://www.npmjs.com/package/@vercel/routing-utils

5. **How Vercel itself bundles many API routes into one Node function (2026 source)** —
   `vercel/vercel` `packages/node/src/build.ts` (behind `VERCEL_API_FUNCTION_BUNDLING=1`) emits
   `handle: 'hit'` routes that inject the **original path** into a header:
   `{"src":"/((?!index$).*?)(?:/)?","transforms":[{"type":"request.headers","op":"set","target":{"key":"x-matched-path"},"args":"/$1"}],"continue":true,"important":true}`.
   The shared handler (`bundling-handler.js`) *"reads x-matched-path to determine which entrypoint to
   invoke"* and then passes `req` to user code unchanged (`return handler(req, res)`); current
   `@vercel/node` runtime code performs no `x-matched-path` → `req.url` rewriting.
   https://github.com/vercel/vercel/tree/main/packages/node/src

6. **`x-matched-path` is the platform→function signal for the matched route (dest side)** —
   Next.js PR #77994 (Vercel maintainer): *"When rendering the page on Vercel, we send the
   x-matched-path header to indicate which route should be rendered."*
   https://github.com/vercel/next.js/pull/77994

## Inference (labeled)

- [INFERENCE] For `/api/(.*)` → `/api`, a regular Node function sees `req.url = /api/<original-subpath>`
  (plus the original query string). Combines #1 (direct observation of this exact route shape) with #2/#3
  (documented model: dest selects, observed path defaults to the original). No official doc states this
  sentence verbatim for plain Functions.
- [INFERENCE] The original query string survives the rewrite (routes match "each incoming pathname
  (excluding querystring)", and `dest` may include its own query, which is merged).
- [INFERENCE] Vercel's bundled-function implementation injecting `x-matched-path` via transforms — rather
  than reading `req.url` — suggests header-based dispatch is the robust choice: it is normalized
  (trailing slash stripped), immune to user `request.path` transforms, and marked `important: true`.

## Caveats

- **Prerender functions are the exception**: with a `<name>.prerender-config.json`, `req.url` is the
  rewritten path and the original path must be recovered from the `x-now-route-matches` header
  (discussion #8329; official prerender example:
  https://github.com/vercel/examples/blob/main/build-output-api/prerender-functions/.vercel/output/functions/blog/post.func/index.js).
  Not relevant to a bundled API function unless prerender outputs are used.
- `req.url` behavior is platform behavior, not part of the Build Output schema; the platform could
  change it (the 2022→2026 doc drift around `request.path` transforms shows this area evolving).

## Recommendation for #762

Mirror Vercel's own bundling approach: route `/api/(.*)` to the single bundled function and dispatch
internally on the original path carried out-of-band (an injected `x-matched-path`-style request header
via `request.headers` transform with `args: "/$1"`, or an explicit dest query param), rather than
parsing `req.url`. `req.url` preservation is well-evidenced (#1–#3) but is the platform's default,
not a documented contract you can pin routing correctness to.

## Sources

- https://github.com/vercel/vercel/discussions/8329 — exact route shape, regular vs prerender behavior, maintainer confirmation
- https://vercel.com/docs/project-configuration/vercel-json — `routes`, `rewrites`, `request.path` transform quotes
- https://vercel.com/docs/services/routing — "service receives the original request path"
- https://vercel.com/docs/routing/rewrites — `/resize` example (destination query enrichment)
- https://vercel.com/docs/build-output-api/configuration — v3 `routes` (`src`/`dest`/`check`) schema
- https://github.com/vercel/vercel/tree/main/packages/node/src — bundling-handler.js, build.ts bundling routes, runtime pass-through
- https://github.com/vercel/next.js/pull/77994 — x-matched-path purpose
- `@vercel/routing-utils` `getTransformedRoutes()` executed locally to confirm rewrite→route compilation
