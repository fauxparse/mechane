# Transformers evaluate sandboxed Formulas where their scope lives

Transformers run director-authored **Formulas** against their named input ports. The Formula runtime is a TypeScript vendoring of TomFrost/Jexl v2.3.0 (`29d1ac0`), not an external runtime dependency: we own its parser and synchronous evaluator so the server and Player execute one implementation.

Formula evaluation is typed, synchronous, deterministic, and pure. It never inherits JavaScript coercion, truthiness, object identity, globals, or arbitrary code execution. Typed Absence and Formula failures propagate explicitly, and both evaluation sites enforce the same deterministic work and output budgets. The complete stock JEXL expression surface remains parseable; the checker diagnoses invalid names, Types, access and calls rather than relying on a security-oriented syntactic subset.

Reference identity is part of the runtime contract. Selecting, filtering or shuffling an existing Structured Value Instance preserves its reference. Constructing a Shape or array creates a read-only Computed Structured Value Instance with deterministic identity derived from the producing Transformer, output Type and structural path. Shuffle remains pure by reading an explicit seed owned by the Transformer's runtime scope.

**Scope**: a Transformer evaluates **where its scope lives**. A Show-level Transformer evaluates on the server. A Flow-local Transformer — one placed inside a Flow, or made Flow-local by consuming any Flow-local input (#29) — evaluates wherever that Device Instance's state lives: on the server for a Shared Device, and in the browser for a per-connection Device.

This boundary separates the original decision's two rationales. **Sandboxing** applies wherever a Formula runs because director-authored input is untrusted. **Determinism** keeps shared results identical by evaluating Show-level data centrally; a per-connection Flow-local result has no shared value to coordinate, and its inputs exist only in that browser. This is the same locality rule [[0010]] applies to Formulas authored inside Scenes and Blocks.

Persisted Formula meaning is a compatibility boundary. Later parser, operator or Function changes must preserve existing authored meaning or introduce an explicit migration or version boundary; silently reinterpreting a published Formula is not acceptable.

**Considered and rejected**: evaluating every Transformer in each client (shared results could drift and server-owned inputs would be duplicated); evaluating every Transformer on the server (the server does not own per-connection Device Instance state); raw JavaScript `eval`/`new Function` (arbitrary code execution and host-language coercion); and an external JEXL dependency (its array member access silently selects the first item and its asynchronous path cannot serve the synchronous shared resolver).
