# Browser persistence for Player state: Web Storage vs IndexedDB

Research for [#479](https://github.com/fauxparse/mechane/issues/479); input to [#480](https://github.com/fauxparse/mechane/issues/480).
Date: 2026-09-01. All claims cited to primary sources (WHATWG/W3C specs, WebKit and Chrome vendor documentation, MDN first-party API docs, Playwright/jsdom docs).

## The question

Which browser storage mechanism should back Mechanē's per-connection Player state: a versioned record keyed by public Device identity (normalized pairing code) and Run ID, initially holding navigation state and later Flow-local Source values? Compared below on persistence/eviction, profile and cross-tab behavior, atomicity/concurrency, value shapes, bootstrap cost, quota/failure, private mode, and testability.

## Headline recommendation

**Web Storage (`localStorage`), one JSON record per connection, behind the storage-module interface #480 defines.** The deciding platform fact is that persistence, eviction, quota-bucket, private-mode, and partitioning semantics are **the same for both APIs by specification** — they are registered endpoints of the same origin-keyed storage bucket. IndexedDB's extra machinery (connections, upgrade transactions, version negotiation) buys atomic multi-record writes and huge/blob values, neither of which this record needs. Everything that argues for IndexedDB is a _growth_ condition, not a current requirement; #480's interface keeps the swap cheap.

## The decisive platform fact: one bucket, shared fate

The WHATWG [Storage Standard](https://storage.spec.whatwg.org/) registers both APIs as endpoints of the **same** origin-keyed shelf and bucket:

| Identifier     | Type      | Quota                       |
| -------------- | --------- | --------------------------- |
| `indexedDB`    | « local » | null (bound by shelf quota) |
| `localStorage` | « local » | 5 × 2²⁰ (i.e., 5 mebibytes) |

- Both default to a bucket whose "mode … is `'best-effort'` or `'persistent'`. It is initially `'best-effort'`" ([Storage Standard §4.5](https://storage.spec.whatwg.org/#buckets)).
- Eviction is all-or-nothing per origin, hitting both APIs together: "Whenever a storage bucket is cleared by the user agent, it must be cleared in its entirety" ([§7 Management](https://storage.spec.whatwg.org/#management)); "when an origin's data is evicted by the browser, all of its data, not parts of it, is deleted at the same time. If the origin had stored data by using IndexedDB and the Cache API for example, then both types of data are deleted" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)).
- Under storage pressure, LRU evicts best-effort origins whole ([Storage Standard §7.1](https://storage.spec.whatwg.org/#storage-pressure); [WebKit: "the data of an origin will be deleted as a whole … least-recently-used policy"](https://webkit.org/blog/14403/updates-to-storage-policy/)). Chrome's team reports data "is very rarely cleared automatically by Chrome. It is far more common for users to manually clear storage" ([web.dev](https://web.dev/articles/persistent-storage)).
- `navigator.storage.persist()` upgrades the _whole bucket_ and protects "DOM Storage (Local Storage)" and IndexedDB alike ([web.dev](https://web.dev/articles/persistent-storage)); granted by heuristic in Chrome (installed/bookmarked/engagement), by user prompt in Firefox, and in WebKit "based on heuristics like whether the website is opened as a Home Screen Web App" ([WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/)).

So **choosing IndexedDB buys zero extra durability for Player state**, and choosing localStorage loses none. The differences that remain are API-shape differences: quota ceiling, value types, transactionality, sync/async.

## Comparison

| Dimension              | Web Storage (`localStorage`)                                                | IndexedDB                                                                                |
| ---------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Persistence & eviction | Best-effort bucket; LRU eviction per origin; Safari ITP 7-day cap           | Identical bucket semantics; same cap                                                     |
| Quota                  | 5 MiB/origin (spec-recommended); UTF-16 code units                          | ~60% of disk (Chrome, Safari 17+ browser apps), ~10%/10 GiB (Firefox best-effort)        |
| Value shape            | `DOMString` only; JSON-encode                                               | Any structured-clone value incl. `Blob`, `File`, `Date`, binary keys                     |
| Atomicity              | Per-key atomic; no multi-key transaction; spec warns "no locking mechanism" | Transactions are "an atomic and durable set of data access and data mutation operations" |
| Cross-tab              | `storage` event to other same-origin documents; last-write-wins             | Transactions with overlapping scope serialize; version upgrades can `block` on open tabs |
| Bootstrap              | Synchronous `getItem` at first render; no schema ceremony                   | Async `open()` + `upgradeneeded` version negotiation before any read                     |
| Failure mode           | Synchronous `QuotaExceededError` throw at `setItem`                         | Async transaction abort (`QuotaExceededError`/`UnknownError`)                            |
| Private mode           | In-memory, cleared at session end (per-tab ephemeral in Safari)             | Identical                                                                                |
| Available in workers   | No (`[Exposed=Window]`)                                                     | Yes                                                                                      |
| Test cost (this repo)  | Trivial fake; Playwright seeds via base `storageState`                      | Needs `fake-indexeddb` or injection; Playwright snapshot opt-in (v1.51+)                 |

## Evidence by dimension

### Persistence and eviction

Beyond the shared bucket above, Safari adds a proactive cap: ITP deletes "all of a website's script-writable storage after seven days of Safari use without user interaction on the site … Indexed DB, LocalStorage, Media keys, SessionStorage, Service Worker registrations and cache" ([WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)). Web applications added to the Home Screen are exempt: they "have their own counter of days of use … We do not expect the first-party in such a web application to have its website data deleted", and their "website data … is kept isolated from Safari" ([WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/), [WebKit 2020](https://webkit.org/blog/11338/cname-cloaking-and-bounce-tracking-defense/)). Mechanē's Player is installable (`apps/player/public/manifest.webmanifest`), which on WebKit also biases `persist()` toward granting.

### Browser profile and cross-tab behavior

Both APIs are origin-scoped and shared across all same-origin tabs within one browser profile; separate profiles have separate storage (Firefox even computes quota from "the total disk size where the profile of the user is stored" — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)). In third-party contexts both are partitioned by top-level site (Chrome 115+; "Web Storage API … They are not quota-managed, but are still partitioned" — [Chrome](https://privacysandbox.google.com/cookies/storage-partitioning)); irrelevant while Player runs top-level at `show.mechane.dev`.

Cross-tab, the two differ in kind:

- `localStorage` mutations "dispatch a `storage` event on `Window` objects holding an equivalent `Storage` object" — i.e., every same-origin tab _except_ the writer, with `key`/`oldValue`/`newValue` ([HTML §12.2](https://html.spec.whatwg.org/multipage/webstorage.html#the-storage-interface)). This is a ready-made change-notification channel for the Player key.
- IndexedDB has no change events; instead, cross-tab interactions surface during **version upgrades**: `open()` with a higher version fires `versionchange` at other connections and "will be blocked until they all close" ([IndexedDB 3.0 §4.3](https://w3c.github.io/IndexedDB/#dom-idbfactory-open)). A stale tab that ignores `onversionchange` wedges the upgrade mid-show — a failure mode `localStorage` simply does not have.

### Atomicity and concurrency

- Web Storage: each `setItem` is atomic for one key (single map-set step in the [spec algorithm](https://html.spec.whatwg.org/multipage/webstorage.html#the-storage-interface)), and identical writes are no-ops. But there is explicitly no multi-key or cross-agent transactionality: "This specification does not define the interaction with other agent clusters in a multiprocess user agent, and authors are encouraged to assume that there is no locking mechanism," illustrated by the spec's own read-increment-write race across two windows ([HTML §12.1](https://html.spec.whatwg.org/multipage/webstorage.html#introduction-16)). Consequence: a read-modify-write of the record across tabs is last-write-wins.
- IndexedDB: "A transaction represents an atomic and durable set of data access and data mutation operations," and at commit the implementation "must atomically write any changes … either all of the changes must be written, or if an error occurs … the changes are aborted" ([IndexedDB 3.0 §2.7, §2.7.1](https://w3c.github.io/IndexedDB/#transaction-concept)). Transactions with overlapping store scope serialize (3.0 tightened scheduling — [changes](https://w3c.github.io/IndexedDB/#changes)), so get→modify→put inside one `readwrite` transaction is safe even against another tab. Durability hints (`strict`/`relaxed`/`default`) exist per transaction.

This is the one axis where IndexedDB is _stronger_ — and it only matters if multiple same-profile tabs concurrently mutate the **same** record. A single-writer-per-connection model (or the `storage` event as a same-tab coordination signal) removes the need.

### Supported value shapes

- Web Storage: keys and values are `DOMString`s, "in the UTF-16 string format" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)); objects must be JSON-encoded, and quota is consumed in UTF-16 code units.
- IndexedDB: "User agents must support any serializable object … `String` primitive values and `Date` objects as well as `Object` and `Array` instances, `File` objects, `Blob` … stored and retrieved by value rather than by reference" via `StructuredSerializeForStorage` ([IndexedDB 3.0 §2.3](https://w3c.github.io/IndexedDB/#value)).

Mechanē's record is navigation state plus Flow-local Source values, which the domain already models as JSON-shaped structured values (`sourceFieldDefaults`-style `{ nodeId, fieldPath, value }`; the Shape value kinds are text/number/boolean/color/image etc. per [#92 research](shape-graphql-prior-art.md)). No Blobs today; Dates can be ISO strings. JSON round-trip is sufficient.

### Synchronous vs asynchronous bootstrap

- `localStorage` reads/writes are synchronous and available at first script execution; restoring navigation state before first render needs no await and no schema ceremony.
- IndexedDB "operations … are done asynchronously, so as not to block applications" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)): every read requires `open()` → `onupgradeneeded`/`onsuccess` → transaction → request events. The Player could not restore state without a promise hop (and #480's interface would have to be async throughout).
- The sync cost argument against `localStorage` (main-thread blocking) scales with record size; for a KB-scale record it is noise. It would become real at hundreds of KiB per write.

### Quota and failure behavior

- Web Storage: spec-recommended quota is 5 MiB per origin ([Storage Standard §4.1 table](https://storage.spec.whatwg.org/#storage-endpoints)); "Once this limit is reached, browsers throw a `QuotaExceededError` exception" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)). Failure is a synchronous throw at the write site: "If _value_ cannot be stored, then throw a `QuotaExceededError`" — covering quota, disabled storage, and policy refusal in one catchable path ([HTML §12.2.1](https://html.spec.whatwg.org/multipage/webstorage.html#the-storage-interface)).
- IndexedDB: shelf-level quota (Chrome ≈60% of disk; Safari 17+ browser apps ≈60%, embedded WebKit apps ≈15%; Firefox ≈10%/10 GiB best-effort — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/)). Quota failures surface asynchronously as transaction aborts "for example a `QuotaExceededError` or an `'UnknownError'` `DOMException`" ([IndexedDB 3.0 commit steps](https://w3c.github.io/IndexedDB/#transaction-concept)).
- Both APIs can also be unavailable outright: the `localStorage` getter "throws a `SecurityError` … if the `Document`'s origin is an opaque origin or if the request violates a policy decision (e.g., if the user agent is configured to not allow the page to persist data)" ([HTML §12.2.3](https://html.spec.whatwg.org/multipage/webstorage.html#the-localstorage-attribute)); "if the user blocks cookies, browsers will probably interpret this as an instruction to prevent the page from persisting data" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)).

A per-connection Player record is a few KB; 5 MiB leaves ~three orders of magnitude of headroom even with dozens of Runs retained.

### Private mode

Both APIs behave the same, and neither persists: "in private browsing mode … browsers may apply different quotas, and stored data is usually deleted when the private browsing mode ends" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)); `localStorage` data in a private session "is cleared when the last 'private' tab is closed" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)). Safari Private Browsing is stricter and again uniform across APIs: it "is based on WebKit's ephemeral sessions where nothing is persisted to disk … Private Browsing also uses a separate ephemeral session for each new tab" ([WebKit](https://webkit.org/blog/11338/cname-cloaking-and-bounce-tracking-defense/)) — so in Safari private windows, `localStorage` is not even shared between tabs. Whatever the mechanism, #480 needs an "unavailable storage → start fresh, re-sync from server" path; treat persistence as strictly best-effort within a Run.

### Practical testability

- This repo runs vitest with `environment: "node"` (`vitest.config.ts`): **neither** API exists in unit tests today, so either way the storage module must be injected — exactly the seam #480 asks for. A `localStorage` fake is a `Map` with a quota; an IndexedDB fake means a dependency (`fake-indexeddb`) or a hand-rolled `IDB*` surface.
- jsdom (if adopted later) implements Web Storage natively with a configurable 5,000,000-code-unit quota "as inspired by the HTML specification" ([jsdom README](https://github.com/jsdom/jsdom#basic-usage)).
- Playwright's `browserContext.storageState()` "contains current cookies, local storage snapshot, IndexedDB snapshot and virtual WebAuthn credentials", with IndexedDB opt-in since v1.51 and `origins[].localStorage` in the base format — E2E seeding and inspection work for both; `localStorage` is the lower-friction default ([Playwright API](https://playwright.dev/docs/api/class-browsercontext#browser-context-storage-state)).

## Recommendation for Mechanē

Use **`localStorage`** for the versioned per-connection record, wrapped in #480's storage-module interface so the mechanism is an implementation detail:

1. **One durable record, one key**: the whole per-connection aggregate (schema version, navigation state, later Flow-local Source values) lives in a single namespaced key derived from public identity, e.g. `mechane.player:<normalized-pairing-code>:<runId>`. Single-key writes make per-key atomicity sufficient. Separate ephemeral coordination metadata may use another key without fragmenting the aggregate. Enumeration-based stale-Run cleanup works via `Object.keys`/`key(n)`, but note "iteration order is not defined and can change upon most mutations" ([HTML §12.2.1](https://html.spec.whatwg.org/multipage/webstorage.html#the-storage-interface)) — never depend on order.
2. **Versioning is app-level**: a `version` field in the JSON record plus a one-time transform on read. This is strictly simpler than IndexedDB's `upgradeneeded`/`versionchange`/`blocked` machinery, whose stuck-upgrade failure mode (a stale tab holding the DB open) is precisely the wrong risk during a show.
3. **Failure handling is one synchronous catch**: wrap writes in try/catch for `QuotaExceededError`/`SecurityError`; on failure, continue in memory for the current page lifetime. If memory is later lost, bootstrap a fresh local aggregate from the active Run and published Flow default — the server cannot restore the previous per-connection position because it never owns that state. Never gate navigation on durable browser storage.
4. **Cross-tab policy (settled in #480)**: one ephemeral active-tab claim per Device and Run makes the newest same-profile tab the only writer. A `storage` event invalidates older tabs; the durable aggregate remains whole-record replacement. This is a best-effort duplicate-tab guard rather than a security boundary. If future Flow-local values require concurrent multi-tab mutation, that is the trigger to move that data to IndexedDB transactions (or add Web Locks), not a reason to start there.
5. **Optionally request `navigator.storage.persist()`** opportunistically (e.g., after a successful join): it is auto-granted for installed/bookmarked sites in Chrome and for Home Screen web apps in WebKit, a silent no-op returning `false` elsewhere, and it upgrades the shared bucket for free.

**Platform guarantees vs implementation judgment.** Same-bucket persistence/eviction/private-mode/partitioning semantics and the 5 MiB endpoint quota, per-key write atomicity, the absent locking guarantee, the `storage` event, synchronous failure throwing, and IndexedDB's transactional atomicity are all spec/vendor facts cited above. The judgment calls — that a single-record aggregate fits one key, that JSON codec discipline is acceptable, that last-write-wins is tolerable for navigation state, that KB-scale sync writes are cheap enough, and that the mechanism should stay swappable behind the aggregate interface — are ours, and each has a stated graduation trigger below.

**Residual risks / triggers to graduate to IndexedDB:**

- Record values become binary or blob-sized (image assets rather than URLs) → structured clone + shelf-level quota.
- The aggregate fragments into many records with independent lifecycles, or total storage heads toward MiB scale → multi-record atomic writes and quota headroom.
- Genuinely concurrent multi-tab mutation of the same Source values → transactions (or Web Locks) replace last-write-wins.
- State ever needs to be owned by a service worker (localStorage is `[Exposed=Window]` only; IndexedDB works in workers).
- Mid-show eviction remains possible everywhere (LRU pressure; Safari ITP 7 days without interaction). The server remains authoritative only for the active Run and published graph; eviction necessarily loses that browser's per-connection position and reinitializes it from the Flow default.
