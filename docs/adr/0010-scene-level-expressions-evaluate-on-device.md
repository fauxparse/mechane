# Scene-level expressions evaluate on the Device

Director-authored JEXL inside a Scene evaluates **on the Device**, not on the server — the deliberate exception to [[0004]], which evaluates Transformer expressions server-side only. Two kinds qualify:

- **Event payloads** (issue #135) — a list of named values, each an expression evaluated at the moment the Event fires.
- **Element property expressions** (issue #140) — a property's value given as an expression combining literals and Variables, evaluated per render.

_Originally numbered 0007 and titled "Event payload expressions evaluate on the Device, at fire time", scoped to payloads alone. Widened by #140 when property expressions turned out to need the same treatment for the same reasons, and renumbered to 0010 because 0007 had already been taken by the graph-node interface ADR (#102) landing concurrently. The line that once read "the exception is narrow: it covers Event payloads only" is replaced by the scope paragraph below._

[[0004]] has two rationales, and they come apart here. Its **sandboxing** rationale applies with full force: a director is not a developer, the expression is untrusted input, and it runs as a JEXL subset rather than raw JavaScript wherever it runs. Its **determinism** rationale — every connected Device sees an identical result computed once — does not apply, because a tap payload is not shared state. It is per-Device and per-tap by construction, and the context it needs exists nowhere else: which Element was tapped, the chain of Slot iterations containing it, and the Scene's Variable values as resolved on that Device. Navigation and Flow-local Variables resolve in the `player` client rather than on the server, so a server-side evaluation of a tap payload is not undesirable so much as impossible.

A property expression is the same case wearing different clothes: it evaluates per render, and it reads the Scene's Variables **as resolved on that Device** — including client-resolved Flow-local values. Shipping that context to the server to evaluate it there and shipping the result back is strictly worse than evaluating it where it already lives, with the same sandbox.

**Scope**: expressions authored _inside a Scene or Block_ — event payloads and property values — evaluate on the Device. **Transformers remain server-only** and are untouched, which is what keeps [[0004]]'s determinism guarantee intact where it means something: shared data that every Device must agree on is still computed once, centrally.

Per-connection Navigate Actions follow the same locality decision: the Player owns and persists its active Scene in browser-profile-local state, and the complete published Flow bundle is loaded before interaction. A Player submits an anonymous Event fact for stateless structural validation and aggregation; the server never treats that Event as evidence of the Player's path and never stores its active Scene. Shared Devices remain server-authoritative.

**Considered and rejected**: a fixed, non-authorable payload (no client evaluator to ship and no new exception to make, but the author cannot say what a tap _means_ in their Show, and every interaction would carry the same shape regardless of context); round-tripping to the server to evaluate the payload (preserves [[0004]] verbatim, but the server does not hold the Device-local context the expression reads, so it would have to be shipped up first — evaluating it in the place it already lives, with the same sandbox, for a round-trip's less latency).
