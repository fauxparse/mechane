# Percentage sizing end to end: what actually works on `main`

Research for [#708](https://github.com/fauxparse/mechane/issues/708), part of map [#704](https://github.com/fauxparse/mechane/issues/704); input to [#712](https://github.com/fauxparse/mechane/issues/712) (Prototype percentage entry for width and height).
Date: 2026-09-23. Audited against the resolution comments of [#134](https://github.com/fauxparse/mechane/issues/134) and [#141](https://github.com/fauxparse/mechane/issues/141), with every claim followed to the file and line that owns it. First-hand evidence: two throwaway repro suites on this branch — `packages/rendering/src/percentage-sizing-audit.repro.test.ts` (9 tests; static-markup emission plus an HTML fixture measured in headless Chromium) and `apps/api/src/graphql/percentage-roundtrip.repro.test.ts` (3 tests; the persistence round-trip). All measurements below are from those runs.

## The question

Does percentage sizing behave as #134 and #141 specify, everywhere it is claimed to? One verdict per ticket bullet, each backed by file:line or a reproduction.

## Verdict table

| # | Bullet | Verdict |
| --- | --- | --- |
| 1 | Relative-sizing invariant (no `fill`/`%` under a hugging parent; convert children on parent→hug) | **Not implemented** — in the domain, the renderer, *and* the inspector |
| 2 | Box model: own size border-box, `%` against the parent's content box | **Works** |
| 3 | min/max: domain acceptance, renderer emission, min-wins rules | **Partially works** — min works; **max sizing is never rendered at all** |
| 4 | Absolute Frames: `%` on the grid path; `fill` unavailable there | **Partially works** — `%` works; `fill` is *not* blocked in any layer |
| 5 | Round-trip of `{ value: 50, unit: "%" }` through persistence → GraphQL → decode → validation → inspector | **Works** — nothing loses or coerces the unit in transit |
| 6 | Existing coverage of percentages | **Thin** — one incidental renderer assertion, two story values, three unwrap tests |
| 7 | Slot wins over a `fixed` Block root; Slot Layout Container's independent sizing | **Partially works** — behaviour correct in the renderer; **slot sizing is never validated in the domain** |

---

## 1. The relative-sizing invariant — **not implemented**, in all three layers

#134: "a child cannot express its size relative to a parent that is sizing itself from its children… on any axis where the parent `hug`s, a child may use neither `fill` nor a percentage — the option is unavailable in the inspector, not resolved silently," and switching a parent *to* hug converts children's `fill`/percentage values to `fixed` at computed size.

**Domain — not implemented.** `assertValidCanvas` validates each element in isolation: `visit` recurses with no parent context (`packages/domain/src/canvas.ts:337-366`), and `assertAxisSize` (`canvas.ts:273-284`) checks only mode membership and value finiteness. Nothing relates a child's axis mode or unit to its parent's axis mode. `visit(canvas.root, new Set(), true)` at `canvas.ts:370` is the only parent/child information available, and it is discarded.

**Renderer — not implemented, and resolves silently.** `dimensionFor` maps hug → `max-content` and then falls through to the child's authored value with no knowledge of the parent (`packages/rendering/src/canvas-renderer.tsx:82-97`). Reproduction (repro test "renders a hugging parent with a percentage child…", measured in Chromium on the fixture's `percentUnderHug` scene): a `hug` frame containing a rect at `width: {value: 50, unit: "%"}` renders **both at 0 px wide** — the browser treats a percentage against an intrinsically-sized (`max-content`) parent as `auto` during intrinsic sizing and the contentless rect collapses. That is exactly the invisible fallback #134 rejected, with the additional observation that here it doesn't even fall back to something visible.

**Inspector — not implemented.** The sizing menu offers Fixed / Fill / Hug unconditionally (`packages/design-system/src/components/ui/property-input/menu.tsx:96-127`); `PropertyInputProps` has no disabled/unavailable concept to wire one to (`property-input-types.ts:25-62`). `SizeField` derives its display from the stored value only and never consults the parent (`apps/studio/src/editors/canvas/components/CanvasInspector/SizeField.tsx`). The parent→hug conversion does not exist anywhere: the only code that writes a computed size on a mode change is the child's *own* mode switch, `sizingForMode(size, mode, currentValue)` (`canvas-inspector-values.ts:189-201`, used at `SizeFieldInput.tsx:70-72` with `currentDimensions`). Grepping the studio app for hug finds only artboard sizing (`data/canvas-workspace.ts:44-51`) and this mode switch — no cascade touching children when a parent's axis becomes `hug`.

One related behaviour worth knowing for #712: `sizingForMode`'s hug→fixed / fill→fixed path writes `value: currentValue` — a **plain px number** (`canvas-inspector-values.ts:196-197`). So the child-side conversion at computed size exists and silently converts a stored percentage to px; the parent-side trigger for it does not.

## 2. The box model — **works**

- **Own size is border-box:** `boxSizing: "border-box"` is set on every element (`canvas-renderer.tsx:197`). Measured: a frame at `fixed 120 × 60` with `padding: 30` renders exactly **120 × 60** outer (`borderBox` fixture scene) — padding eats content, not the authored size.
- **`%` resolves against the parent's content box:** the renderer relies on CSS containing-block rules and does not interfere — padding is authored in px on the frame (`paddingValue`, `canvas-renderer.tsx:110-116`, applied by `frameStyle` at `:231`/`:241`), the child's percentage width is emitted bare (`sizeValue`, `:48-52`). Measured: a 600-px parent with 40 px padding and a child at `width: 50%` renders the child at **260 px = (600 − 80) / 2** — 50 % of the *content* box (it would be 300 against the border box). Same on the grid path: parent 600 with 20 px padding, child `50%` → **280 = (600 − 40) / 2**.
- Padding and gap are px-only, as #134 requires: `Padding` is a numbers record (`canvas.ts:202-207`), `FrameGap` is `number | "auto"` (`canvas.ts:45`), and `paddingValue`/`gap` emit `px` (`canvas-renderer.tsx:110-116, 230`).

One nuance, expected rather than broken: the **Scene root ignores its authored sizing** — `elementStyle` forces `100%` on both axes when `root && sceneRoot` (`canvas-renderer.tsx:198-199`), and `sceneRoot` is `canvas.kind === "scene"` (`canvas-presentation.ts:161`). A Scene root is the viewport and takes its size from its host container (#132); authored root sizing matters only for Block canvases, which the Studio artboard measures from the DOM (`data/canvas-workspace.ts:44-51`). This is why the repro fixture's roots all measure 600 × 240 (their host div) regardless of authored 500/400/300.

## 3. min/max — **partially works**: min works, **max is never rendered**

- **Domain acceptance — works.** `minWidth`/`maxWidth`/`minHeight`/`maxHeight` are `SizeValue` (`canvas.ts:96-99`) and each is run through `assertSizeValue`, which accepts finite non-negative px or % (`canvas.ts:310-317, 257-271`). Confirmed from the round-trip repro: `{ value: 90, unit: "%" }` on maxWidth decodes and validates; `unit: "vw"` and negative values are refused.
- **Renderer emission — min only; max is silently dropped.** `elementStyle` emits `minWidth` and `minHeight` (`canvas-renderer.tsx:200-201`) and has **no `maxWidth`/`maxHeight` properties at all**. `constraintFor` was written with all four axes in its type (`canvas-renderer.tsx:98-108`) — the maxWidth/maxHeight arms are dead code that nothing calls. Reproduction (repro test "emits percentage min constraints but SILENTLY DROPS max constraints…"): an element authored `minWidth: {value: 60, unit: "%"}, maxWidth: {value: 30, unit: "%"}` renders `style="…min-width:60%…"` and no `max-width`. This drops px maxes as surely as % maxes — `constraint-square` in the ConstraintsAndRotations story authors `maxWidth: 120` and gets nothing. The inspector happily authors the number (`SizeConstraintField.tsx:36-45`), so the value is stored, transported, validated, shown in the field, and ignored by the only thing that paints it.
- **"min wins over max" — moot end-to-end.** Since max is never emitted, the combination cannot occur in rendered output. The underlying CSS ordering holds (probed directly in Chromium: `width: 20%; max-width: 30%; min-width: 60%` on a 400-px parent resolves to **240 px**), so emitting max would inherit the rule for free. #134's "the inspector prevents entering a max below the min in the first place" is **not implemented** — `SizeConstraintField` has no cross-field validation, and `SizeFields.toggleConstraint` seeds min at 0 and max at the computed size with no relationship check (`SizeFields.tsx:44-53`).
- **"min wins over the parent's fill, producing overflow" — works.** Measured: an auto-layout parent 600 px wide with a child at `width: fill` (`width: 100%` + `flex-grow: 1`, `canvas-renderer.tsx:89, 334-337`) plus `minWidth: {value: 150, unit: "%"}` renders the child at **900 px** with parent `scrollWidth: 900` — the min clamps the fill and the child overflows visibly (`minBeatsFill` fixture scene).

## 4. Absolute Frames — **partially works**

- **Percentages on the grid path — works.** An absolute Frame renders as `display: grid; grid-template-columns/rows: minmax(0, 1fr)` (`canvas-renderer.tsx:237-242`), children get `grid-area: 1 / 1` (`:333`). A child at `width: {value: 50, unit: "%"}` emits `width: 50%` alongside `grid-area: 1 / 1` (repro test), and **measures 280 px inside a 600-px grid parent padded 20** — the grid track is the content box, so the percentage resolves against exactly the space #134/#141 mean. Rotation transposes constraints correctly (`constraintFor`, `canvas-renderer.tsx:104-107`; covered by the existing rotation test, see §6).
- **`fill` unavailable there — not implemented, in any layer.** The domain accepts `fill` anywhere (`assertAxisSize` has no parent notion, `canvas.ts:273-284`). The inspector's DimensionMenu offers "Fill container" unconditionally (`menu.tsx:104-107`). The renderer emits `width: 100%` for fill regardless of parent mode (`canvas-renderer.tsx:89`) — repro test "still emits width:100% for fill inside an absolute (grid) Frame"; measured, it renders the full 600 px (`gridFill` fixture). So inside an absolute Frame, `fill` silently behaves as `100%` — the "second spelling of one idea" #141 explicitly rejected, offered to authors as if it were a distinct mode.

## 5. Round-tripping `{ value: 50, unit: "%" }` — **works**

Every hop carries `sizing` as an opaque JSON value; none of them knows a unit exists, so none can lose it:

1. **Write codec:** workspace edits carry `properties` verbatim (`packages/commands/src/canvas-edit-codec.ts:166-177` — passthrough, no per-field shaping).
2. **JSONB rows:** `elementRow` strips only `id/type/name/hidden/rank/children/parentId` and stores the rest — `sizing` included — in the `canvasElements.properties` jsonb column (`apps/api/src/db/canvas.ts:469-495`); `toElement` spreads it back untouched (`canvas.ts:67-90`). Writes are gated by `assertValidCanvas` (`canvas.ts:697`), reads too (`canvas.ts:160`).
3. **GraphQL document:** `flattenCanvasElements` spreads all fields (`apps/api/src/graphql/canvas.ts:42-57`); the schema types `sizing: JSON` (`apps/api/src/graphql/schema.ts:840`), so the object crosses the wire as-is.
4. **Decode + validation:** `decodeElement` drops nulls and otherwise spreads (`packages/graphql-schema/src/canvas.ts:245-270`); `decodeCanvasDocument` rebuilds the tree and ends in `assertValidCanvas` (`canvas.ts:390`), whose `assertSizeValue` accepts `unit: "%"` (`domain canvas.ts:264-270`).
5. **Inspector:** the decoded value is read by `sizeValueUnit` → `"%"` and `sizeValueNumber` → `50` (`canvas-inspector-values.ts:213-223`; covered by `canvas-inspector-values.test.ts:29-31`), displayed as `50%` (`formatValueText`, `use-property-input.ts:44-51`), and **numeric edits preserve the unit** — `SizeFieldInput` writes `{ value, unit }` when the derived unit is `%` (`SizeFieldInput.tsx:88`), and `SizeConstraintField` likewise (`SizeConstraintField.tsx:40-42`).

Reproduction: `apps/api/src/graphql/percentage-roundtrip.repro.test.ts` (3 passing tests) drives `flattenCanvasElements` → `JSON.parse(JSON.stringify(…))` (what jsonb and the JSON scalar both do) → `decodeCanvasDocument`, and asserts the width, minWidth, and maxWidth all come back as `{ value, unit: "%" }` — plus that `unit: "vw"` and `-50%` are refused at this same gate, proving the unit is validated rather than ignored.

**Nothing loses or coerces the unit in transit.** The two hazards are at the edges, not the pipe: the unit cannot be *authored* (no control — that's #712's subject), and a sizing-mode switch converts the value to px at computed size (`sizingForMode`, `canvas-inspector-values.ts:196-197`).

## 6. Existing coverage — **thin and incidental**

What exercises percentages today:

- **`packages/rendering/src/canvas-renderer.test.ts:679-733`** — the single percentage assertion in the renderer suite, and it is incidental: the gradient/rotation serialization test authors `minWidth: { value: 100, unit: "%" }` (`:694`) and asserts the rotation-transposed `min-height:100%` (`:727`). No test asserts a percentage *width/height*, none on either layout path specifically, none for fill-in-absolute, and **none for any max constraint, px or %** (consistent with §3: max is dead code).
- **`packages/rendering/src/canvas-renderer.stories.tsx`** — `ConstraintsAndRotations` (absolute root): `top-left-rotation` at `width: { value: 130, unit: "%" }` (`:382`) and `bottom-left-rotation` at `minHeight: { value: 90, unit: "%" }` (`:427`). The px-unit object form (`{ value: 360, unit: "px" }`, `:38, :54-55, :159-162`) appears in the same story. No percentage inside an auto-layout Frame.
- **`apps/studio/.../canvas-inspector-values.test.ts:29-31`** — `sizeValueNumber`/`sizeValueUnit` unwrap `{ value: 50, unit: "%" }`.
- **`packages/design-system/.../property-input.stories.tsx`** (`Percentage` story, ~`:180`) — displays the `%` suffix via the `unit` prop; a display story, not behaviour.

Untested (now covered by this branch's repro, which should be deleted or promoted when #712 lands): percentage emission on the fixed path; percentages under auto vs absolute parents; fill inside an absolute Frame; max constraints; the hug-parent combination; the persistence round-trip; percentage sizing on a Slot.

## 7. The Slot and Block-root cases — **partially works**

**"A `fixed` Block root inside a Slot whose parent says `fill` — the Slot wins": structurally true in the renderer.** The two sizings never meet: the Slot element renders from **its own** `sizing` (`elementStyle`/`dimensionFor` on the slot, `canvas-renderer.tsx:328-330` with `isAutoLayout(slot) === true`, `:219-221`), and each Block instance renders the Block canvas's root as an ordinary child with `parent: element` (the slot) carrying its **authored** sizing untouched (`canvas-presentation.ts:119-139` prepares `instance.canvas.root` verbatim; `canvas-renderer.tsx:388-401` renders it; `packages/domain/src/slots.ts` never touches `sizing` — the word does not appear in it). Placements arrive with explicit Slot sizing — `fill`/`fill` on block extraction (`packages/commands/src/block-extraction.ts:239`, asserted at `block-extraction.test.ts:111`) and fixed on drag-creation (`apps/studio/.../block-drag-creation.ts:56-58`) — so the placement, not the Block definition, sizes the instance, which is #134's rule and CONTEXT.md:385's "independent from the sizing … of its Block instances". A `fixed` 300-px card root inside a stretched Slot keeps 300 px; nothing stretches it and nothing lets it veto the Slot's size.

**The Slot Layout Container's independent sizing — works in the renderer and inspector, unvalidated in the domain.**

- Renderer: a Slot with `width: { value: 50, unit: "%" }` emits `width: 50%` with `display: flex` (repro test "keeps the Slot's own percentage sizing…"); a `fill` Slot emits `width: 100%`. A percentage on a Block *root* behaves like any element's — it resolves against the Slot's content box.
- Inspector: `SizeFields` renders for Slot selections (`LayoutSection.tsx:32-34, 121`), so Slot sizing is authorable subject to the same px-only limitation as everything else.
- **Domain gap:** `assertLayout` returns early for slots (`domain canvas.ts:287-302`) — blockId and paint properties are checked, but the `sizing` loop at `:303-317` is never reached, so a Slot with an unknown mode or a negative percentage passes `assertValidCanvas` where the same authoring on any frame would be refused. Also, the model driving the inspector computes `absolute = !parent || parent.type !== "frame" || parent.layoutMode !== "auto"` (`use-canvas-inspector-model.ts:203`), which counts a **Slot parent as absolute** even though slots are always auto-layout in the renderer (`canvas-renderer.tsx:220`); today that only misgates the Position/anchor section (`PositionSection.tsx:10`), whose anchors the renderer ignores under an auto parent (`canvas-renderer.tsx:333`), but it is the exact predicate #712 will need for fill/percent availability, and it is wrong for slots.

---

## What this leaves for #712

The transport and the CSS are ready: a stored percentage round-trips untouched, validates, displays, survives numeric edits, and resolves exactly as #134 specified on both layout paths (measured). What #712 designs on top of is: **no authoring control** (unit is derived, `parsePropertyInputValue` strips `%` from typed input — `use-property-input.ts:77`), **no availability model anywhere** (the `DimensionMenu` has no notion of "unavailable"; nothing knows the parent's axis mode), **no parent→hug cascade**, **max constraints silently dropped by the renderer**, and **a slot-parent predicate that misclassifies slots as absolute**.

## Reproduction index (this branch, `research/percentage-sizing-audit`)

- `packages/rendering/src/percentage-sizing-audit.repro.test.ts` — 9 tests: emission of `width:50%` under auto and grid parents, fill-in-absolute, min emitted / max dropped, border-box, slot percentage + fill sizing, hug-parent combination, and the fixture writer.
- `packages/rendering/src/percentage-sizing-audit.fixture.html` — generated by the above; measured in headless Chromium via `getBoundingClientRect` (numbers quoted in §2–§4).
- `apps/api/src/graphql/percentage-roundtrip.repro.test.ts` — 3 tests: the `%` unit survives flatten → JSON → decode → validation; `vw` and negative values refused.

Run: `npx vitest run packages/rendering/src/percentage-sizing-audit.repro.test.ts apps/api/src/graphql/percentage-roundtrip.repro.test.ts` (both green at commit time).
