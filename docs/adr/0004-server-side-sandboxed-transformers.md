# Transformers evaluate server-side, using a sandboxed JEXL subset

Transformers run director-authored expressions against Source data. We evaluate them server-side (not independently on each Device) so every connected Device sees an identical, consistent result computed once — this also matches the live-data propagation model in [[0002]], where the server is the source of truth that fans data out via the realtime layer.

Because directors (not developers) author these expressions, we do not execute them as raw JavaScript. A director's expression runs on our infrastructure and is effectively untrusted input; a JEXL subset gives expression-like ergonomics (arithmetic, string formatting, property access) without arbitrary code execution.

**Scope**: a Transformer evaluates **where its scope lives**. A Show-level Transformer evaluates on the server, as above. A **Flow-local** Transformer — one placed inside a Flow, or made Flow-local by consuming any Flow-local input (#29) — evaluates wherever that Device Instance's state lives: on the server for a Shared Device, and **in the browser for a per-connection Device**.

This does not weaken the decision above, because its two rationales come apart at exactly that line. **Sandboxing** applies wherever the expression runs: a director is not a developer, the expression is untrusted input, and it runs as a JEXL subset either side. **Determinism** — every connected Device seeing one identical result computed once — protects shared data that Devices must agree on, and a Flow-local Transformer produces no such data. Its inputs are per-Instance by construction, so there is nothing to keep consistent. For a per-connection Device the server holds none of those inputs, which makes server-side evaluation impossible rather than merely undesirable, the same reasoning [[0010]] applies to Scene-level expressions.

**Considered and rejected**: client-side evaluation (simpler infra, but risks Devices drifting out of sync with each other); raw JS `eval`/`new Function` (arbitrary code execution risk from untrusted director input).
