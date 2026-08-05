# Transformers evaluate server-side, using a sandboxed JEXL subset

Transformers run director-authored expressions against Source data. We evaluate them server-side (not independently on each Device) so every connected Device sees an identical, consistent result computed once — this also matches the live-data propagation model in [[0002]], where the server is the source of truth that fans data out via the realtime layer.

Because directors (not developers) author these expressions, we do not execute them as raw JavaScript. A director's expression runs on our infrastructure and is effectively untrusted input; a JEXL subset gives expression-like ergonomics (arithmetic, string formatting, property access) without arbitrary code execution.

**Considered and rejected**: client-side evaluation (simpler infra, but risks Devices drifting out of sync with each other); raw JS `eval`/`new Function` (arbitrary code execution risk from untrusted director input).
