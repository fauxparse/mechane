# ADR-0019: Element Property Formulas

## Status

Accepted

## Decision

Element Properties may be literals, Variable Connections, or Property Formulas. Connections and Formulas carry an authored fallback. Resolution happens in the domain before rendering, using the owning Scene or Block Variable scope. Repeated Slot instances add `item` and `index` to that scope.

Formula diagnostics are collected at the Canvas boundary. Blocking diagnostics prevent publication; runtime diagnostics use the authored fallback and do not make a draft impossible to save. Closed value-set properties remain literal-only. Property resolution is fallback-first for missing variables, invalid values, incompatible Types, and failed Formula evaluation.

Sizing values preserve `px` and `%` units, and percentage sizing is rejected under a hugging parent because that relationship has no finite reference dimension.

## Consequences

- Renderer code consumes resolved values and does not parse or evaluate Formulas.
- Studio can preserve malformed Formula text while showing an Element Property diagnostic.
- Publication validates every Scene and Block Canvas before the snapshot is written.
- Formula identifiers must be NFC-normalised, unique within their owner, and valid parser identifiers.
