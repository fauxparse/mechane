# ADR-0021: The Formula editor is design-system chrome

## Status

Accepted

## Decision

The Formula editor (the CodeMirror `FormulaEditor`, its Lezer grammar, and the `FormulaFlyout` a Property row opens) lives in `@mechane/design-system`, beside the `PropertyInput` that opens it. `PropertyInput` takes a `formula` prop: a Formula-driven row is read-only, reads the Formula's result, and its trailing button opens the host's editor.

The trailing button states what a Property's value is. A literal or nothing shows a chevron onto the Property menu, visible on hover or focus. A Variable shows the plug, a Formula the Formula mark, and a Fill or Hug size its sizing icon, each on the accent and always visible. A size's Fill, Hug, Variable and Formula are mutually exclusive, so exactly one state applies; `AxisSize` encodes that, and Fill or Hug carries no value.

The design system owns presentation only: the draft, what applying it writes, per-Element fallbacks and Mixed selections stay with the host.

## Context

#732 kept the editor in Studio, reading [ADR-0011](0011-canvas-rendering-package.md) as ruling the design system out. ADR-0011 separates Canvas _rendering_ from application chrome; it says nothing against chrome that authors content. A Formula editor is chrome, and the design system already depends on `@mechane/domain` for `PropertyInput`'s value shapes.

## Consequences

- The Canvas inspector and the Show graph import one editor, lazy-loaded as one chunk.
- `@mechane/design-system` carries the CodeMirror and Lezer dependencies; nothing else in Studio does.
- The whole authoring loop — the button states, _Write a Formula_, Enter to apply and Esc to cancel — is exercised in Storybook against a stub scope with design-time values.
