# Scene-level Formulas evaluate on the Device

Director-authored Formulas inside a Scene evaluate **on the Device**, not on the server. This follows [[0004]]'s scope rule rather than forming a separate runtime: one sandboxed Formula implementation runs wherever the values it reads are owned. Two authored surfaces qualify:

- **Event payload Formulas** (issue #135) — named values evaluated when the Event fires.
- **Element property Formulas** (issue #140) — property values combining literals and Variables, evaluated per render.

_Originally numbered 0007 and titled "Event payload expressions evaluate on the Device, at fire time", scoped to payloads alone. Widened by #140 when property Formulas required the same locality for the same reasons, and renumbered to 0010 because 0007 had already been taken by the graph-node interface ADR (#102)._

[[0004]] separates sandboxing from locality. Sandboxing applies everywhere because a director-authored Formula is untrusted input. Locality follows ownership of the values being evaluated. A tap payload needs the Element that was tapped, its chain of Slot iterations and the Scene Variables resolved on that Device. An Element property reads those same Device-resolved Variables, including Flow-local values. Shipping that context to the server and returning a result would add latency without adding authority.

**Scope**: Formulas authored inside a Scene or Block — Event payloads and Element property values — evaluate on the Device. A Show-level Transformer evaluates on the server. A Flow-local Transformer evaluates where its Device Instance state lives: on the server for a Shared Device and in the browser for a per-connection Device. [[0004]] owns the Transformer rule and the shared Formula runtime contract.

Per-connection Navigate Actions follow the same locality decision: the Player owns and persists its active Scene in browser-profile-local state, and the complete published Flow bundle is loaded before interaction. A Player submits an anonymous Event fact for stateless structural validation and aggregation; the server never treats that Event as evidence of the Player's path and never stores its active Scene. Shared Devices remain server-authoritative.

**Considered and rejected**: fixed, non-authorable Event payloads (the author cannot express what a tap means); round-tripping Device context to the server for Formula evaluation (the server does not own that context); and a separate client expression language (server and Player results could diverge, and persisted Formula meaning would depend on evaluation site).
