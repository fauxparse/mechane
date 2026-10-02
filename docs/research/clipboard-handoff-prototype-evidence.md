# Portable clipboard handoff prototype evidence

Status: the developer accepted bounded evidence with no policy change and explicitly accepted the verification gaps below. This is a throwaway transport experiment, not production clipboard implementation or a completed browser certification matrix.

## Scope and running the fixture

The developer selected macOS 26.6.2 as the representative OS, then reviewed the fixture results and selected "Accept bounded evidence". The listed missing cells are accepted limits for this planning decision, not runtime passes or a reduced product support policy.

- Fixture: `apps/studio/public/clipboard-handoff-prototype.html`.
- With the existing development stack running, open `https://studio.mechane.dev/clipboard-handoff-prototype.html`. If the stack is stopped, use the existing `overmind start -f Procfile.dev` workflow, not a separate fixture server.
- The file is self-contained and can be opened locally for inspection. Async clipboard APIs must be exercised through HTTPS, not treated as working merely because the file opens.
- Raw evidence: [clipboard-handoff-prototype-observations.json](./clipboard-handoff-prototype-observations.json).
- No network/API requests from the fixture, no Show or Run mutation, no asset adoption, no Cut authority, and no production codecs.
- Only `format` and `version` identification and resolved data semantics are fixed here. Other envelope member layouts are illustrative pending the shared-codec decision.

## Environment and mechanisms

Observed OS: macOS 26.6.2, build 25G83, arm64, obtained with `sw_vers`. Browser user-agent OS tokens are reduced and do not establish the installed OS version.

Observed browsers: Chrome for Testing 154.0.8037.92, with an initial headed same-tab probe and a reproducible `--headless=new` scratch-profile run; Chrome for Testing 150.0.7871.24 as supplementary, out-of-window evidence. Version strings came from the running browser, not inferred from its user agent. Installed retail Chrome 154.0.8037.95 and Safari 26.6.2 were inventoried but not driven. No user-installed browser was killed.

- Native copy/paste used trusted browser events invoked with CDP `Input.dispatchKeyEvent` and its `copy`/`paste` browser commands. These were not JavaScript-dispatched synthetic ClipboardEvents. Physical keyboard shortcuts and browser menu items still need human verification.
- Async operations used the page's actual `navigator.clipboard` methods, initiated by browser clicks. No tool clipboard helper or shim was used.
- Baseline permissions were explicitly granted with Puppeteer `overridePermissions` for `clipboard-read`, `clipboard-write`, and `clipboard-sanitized-write`. The raw evidence retains earlier failed probes caused by incomplete permission overrides; those mismatches are not transport fidelity failures.
- Permission denial used a real browser permission override that omitted read permission. It was not a mocked rejection in fixture code. Permission prompt UX was not tested.
- The reproducible Chrome 154 run used the system-trusted Caddy HTTPS origin. The supplementary default Chrome 150 run explicitly ignored the local certificate error. Both reported a secure context.
- Focus-loss probes disabled CDP focus emulation with `Emulation.setFocusEmulationEnabled`, then foregrounded the other real browser tab. The failing submission recorded `focused: false`, `visibility: hidden`, and `activation.active: false`.
- Some initial probes retain default automation focus emulation and therefore show `focused: true` while hidden. Do not use them as evidence that background writes are allowed. The corrected focus probes are explicitly selected in the raw evidence.

## Rolling support window and missing cells

The policy remains current and previous stable desktop major releases of Chrome, Edge, Firefox and Safari on macOS. The observed release inventories give this session's major window:

| Browser | Current / previous stable major | Runtime coverage on local macOS                                                 |
| ------- | ------------------------------- | ------------------------------------------------------------------------------- |
| Chrome  | 154 / 153                       | Chrome for Testing 154.0.8037.92 exercised; retail Chrome and major 153 missing |
| Edge    | 154 / 153                       | Both missing; no Edge installation found                                        |
| Firefox | 157 / 156                       | Both missing; no Firefox installation found                                     |
| Safari  | 27 / 26                         | Both missing; installed Safari 26.6.2 inventoried only                          |

No other OS is part of the representative matrix. No cross-browser-family handoff was exercised. Headless results do not establish full macOS system clipboard interoperability with Safari, Firefox, Edge or external applications. Chrome 150 adds no current/previous stable coverage.

Primary release sources, inspected during the session:

- [Google Chrome for Testing stable inventory](https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json) reported Stable 154.0.8037.92, timestamp 2026-10-02T09:24:10.661Z, and supplied the mac-arm64 test build download.
- [Chrome actively served stable releases](https://versionhistory.googleapis.com/v1/chrome/platforms/mac/channels/stable/versions/all/releases?filter=fraction%3E0&order_by=starttime%20desc&pageSize=6) reported active major 154 rollouts, including 154.0.8037.95. A plain versions list also contained 155 entries; listing a version does not establish active rollout.
- [Microsoft Edge release inventory](https://edgeupdates.microsoft.com/api/products?view=enterprise) reported MacOS Stable 154.0.4258.53, published 2026-10-01T21:56:00.
- [Mozilla product versions](https://product-details.mozilla.org/1.0/firefox_versions.json) reported latest Firefox 157.0, last release 2026-09-29.
- [Apple security releases](https://support.apple.com/en-us/100100) listed Safari 27 released 2026-09-14 and preceding Safari 26 releases. Safari 27 is available for macOS Tahoe; being installed on macOS 26 does not establish the current Safari major.

These inventories identify the window, not runtime passes for untested releases. Re-evaluate the window when running the fixture later.

## Observed results

All rows below refer to Chrome for Testing 154.0.8037.92 on the exact OS above unless explicitly stated. Reproducible scenario observations are selected under `chrome154` in the raw evidence.

| Scenario                                                                               | Mechanism and observation                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same-tab graph, typed value, plain value, quoted Unicode text, number and root absence | Async `writeText` to native paste, then native copy to explicit async `readText`. All six decoded logical values and serialized text matched. Initial headed and reproducible headless runs both recorded successful same-tab handoffs.                                                                                                                                                                    |
| Cross-tab graph, typed value and plain value                                           | Distinct Chrome 154 target IDs; A native copy to B native paste, and B async write to A explicit async read. All six receiving logical comparisons matched. Chrome 150 supplementary cross-tab probes also matched.                                                                                                                                                                                        |
| JSON fidelity                                                                          | Quoting, backslash, newline, emoji, Japanese text and decomposed combining Unicode survived. `5` remained a number; the quoted text fixture remained a string; `null` survived as absence data. Array order and the typed payload's repeated references to one local record, ordered Fields and declared Types remained intact. This proves metadata transport, not production cloning or Type validation. |
| Cold native Copy                                                                       | Sentinel written first. Unready native Copy prevented the default, set no clipboard data and began preparation. Native Paste received the sentinel before readiness and after readiness. A fresh explicit write then produced the matching graph payload.                                                                                                                                                  |
| Failed preparation                                                                     | After the deliberately failing two-second fixture preparation, native Paste still received the sentinel. No clipboard write occurred during the failure.                                                                                                                                                                                                                                                   |
| Cancelled preparation                                                                  | After cancellation and late-result discard, native Paste still received the sentinel. No readiness or write was restored by the late completion.                                                                                                                                                                                                                                                           |
| Denied async read                                                                      | `readText` rejected with `NotAllowedError`, `Read permission denied`. Explicit native Paste still decoded the selected typed value. Async read count stayed 12 before and after that Paste; no second async read occurred.                                                                                                                                                                                 |
| Optional custom format                                                                 | `ClipboardItem` with text plus `web application/x-mechane-clipboard+json` wrote successfully. Explicit async `read` exposed both, and their logical contents matched. Native Paste exposed only `text/plain` and still accepted the portable payload.                                                                                                                                                      |
| Conflicting representations                                                            | Explicit async `read` exposed both disagreeing representations; fixture rejected `conflicting-representations`. Native Paste exposed only text, decoded it, and performed no automatic read to seek a hidden custom representation.                                                                                                                                                                        |
| Lost focus and activation                                                              | Delayed async read and write in the background tab rejected with `NotAllowedError`, `Document is not focused`. Both recorded inactive activation and actual focus loss with focus emulation disabled.                                                                                                                                                                                                      |
| Focus returned                                                                         | Foregrounding the original tab recorded focus return. Async write count remained 13 before and after; no readiness/focus-return auto-write.                                                                                                                                                                                                                                                                |
| Expired activation while focused, permissions granted                                  | Delayed write recorded inactive activation and resolved. Chromium's granted-permission behavior does not establish Safari/Firefox activation behavior and is not a reason to weaken the fresh explicit gesture policy.                                                                                                                                                                                     |

The optional custom-format feature being wholly unsupported was not exercised in a browser without that feature. Native non-exposure was exercised, and text-only transport was exercised independently. This distinction remains a missing cell, not a blanket custom-format fallback certification.

## Agreed adapter conclusions

1. Keep portable JSON in `text/plain` mandatory. Optional web custom formats are supplementary.
2. Native Paste consumes only its event handoff. Compare recognized representations only when that one handoff actually exposes both. A text-only native handoff cannot detect a hidden conflicting custom representation, and must not trigger an async read to look for one.
3. Keep preparation separate from browser writing. Unready controlled graph Copy must prevent the default without calling `setData`, await preparation, then require another explicit Copy action. Do not apply that interception to ordinary text fields.
4. Distinguish browser permission/focus failure from invalid content and Show/Run commit failure. Offer explicit native Paste after denied async read, with no automatic retry.
5. An async write resolution proves that browser's API handoff completed. A native `setData` row alone is not a confirmed receiving round trip. Neither proves continued global clipboard ownership or rollback rights.
6. Preserve the fresh-gesture policy even when granted Chromium permissions happen to permit a delayed write. Browser permissiveness is not the product interaction contract.

No change to graph/value semantics, live safety, Cut authority or compatibility policy was needed. Final strict codecs, byte/record boundaries, target reconciliation and production application are deliberately not proved by this fixture.

## Accepted verification limits

The developer explicitly accepted the retail/current-previous browser gaps, absent cross-browser-family proof, headless automation and native-command limitations, untested permission prompts, and untested wholly missing custom-format support. The decision can close without changing the fixed policy or certifying those missing cells. The resolution comment on the decision ticket is the canonical verdict; this document holds the linked experiment evidence.
