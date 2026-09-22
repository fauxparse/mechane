# Percentage literals in the Formula language: what `100%` would actually cost

Research for [#715](https://github.com/fauxparse/mechane/issues/715), part of map [#704](https://github.com/fauxparse/mechane/issues/704); sibling to [#706](https://github.com/fauxparse/mechane/issues/706)'s settled `{ kind: "formula", formula, unit?: SizeUnit, fallback }` decision.
Date: 2026-09-23. Every repo claim is followed to file and line on `main` (`a96298a`); every Excel claim cites Microsoft's own documentation. First-hand evidence: the throwaway spike on this branch, `packages/domain/src/formula-percent-literals.research.test.ts` (54 tests: today's lexer/parser/evaluator behaviour on the ambiguity corpus, the candidate lexical rule simulated as a token-stream fold, a 1,080-case backward-compatibility cross-product, and the arithmetic the real evaluator produces under each value semantics), plus a regenerated variant of the Lezer editing grammar measured against its conformance property.

## The question

What would it take to make `100%` a percentage literal in the Formula language? One answer per ticket bullet, each costed. It decides nothing.

## Verdict table

| # | Bullet | Verdict |
| --- | --- | --- |
| 1 | Where does the ambiguity bite? | A purely lexical rule is **mechanically sufficient and provably backward-compatible**, but **not unsurprising**: glued `%` followed by an operand (`100%3`, `50%(w)`, `100%-5`, `100%[0]`) stays modulus, and Excel-shaped postfix on expressions (`(a+b)%`) stays an error |
| 2 | What changes, file by file? | Small: ~15–25 lines in `formula.ts` + a one-token grammar edit + corpus entries (generated parser measured size-neutral, 3,169 vs 3,182 bytes). Two pre-existing evaluator/editor conformance divergences (`^`, `.5`) surface the moment a `%` corpus entry touches them |
| 3 | What is the resulting value? | No free lunch: 0–1 breaks the motivating size artifact by 100×; 0–100 breaks Excel arithmetic parity by 100×; a tagged kind buys both only by inventing a promotion algebra across ~20 value-discriminating sites |
| 4 | How does it reach the Property? | The literal's scale and the size arm's `unit` are two sources of one truth that **disagree by 100×**; the only cheap reconciliation is "the arm is the only unit truth", which forces a scale convention #706 just settled the other way |
| 5 | Is modulus worth keeping? | Nothing in the repo, seeds, tests, or catalogue uses `%` as modulus; it is JS truncated remainder, which is *not* MOD's maths anyway. Removing it is 3 sites; a `MOD` Function does not exist and is ~10 lines to add |
| 6 | What does Excel do? | `%` is an arithmetic operator (example `=20%`) binding below negation and above `^`; Excel's arithmetic operator set has **no modulus** — remainder is the `MOD` function; numeric-looking text coerces under arithmetic operators |
| 7 | Blast radius on Transformers? | A Calculate `number` output receives the literal as a bare number (fine mechanically, scale hazard semantically) or rejects/blocks it (tagged kind: new failure mode at `formulaToRuntime`'s gate) |


## 1. Where the ambiguity actually bites

**Today's grammar.** `%` is a binary operator: `OPERATORS` lists it between `/` and `^` (`formula.ts:99-120`, `%` at `:115`), binding power 7 — tighter than `*`/`/`/`//` (6), level with `^` (`formula.ts:261-280`, `%` at `:278`, `^` at `:279`). The lexer scans a maximal-munch operator after punctuation fails (`formula.ts:187-206`), so `%` always becomes one `operator` token regardless of what surrounds it; whitespace is skipped before tokenization (`formula.ts:140-143`), never inside it. The number branch consumes digits and at most one interior `.` (`formula.ts:160-169`) — a trailing `%` is never part of the number token.

Behaviour of every input the ticket names, from the spike (section "current grammar", 22 corpus rows; values via `analyse` with an empty scope):

| Input | Tokens | Parses today? | Result |
| --- | --- | --- | --- |
| `100%` | `number, operator%` | no — `expected a value` at end | — |
| `100 % 3` | `number, operator%, number` | yes | `1` |
| `100%3` | `number, operator%, number` | yes — **modulus** | `1` |
| `100 %3` / `100% 3` | `number, operator%, number` | yes — modulus | `1` |
| `a%b` / `a % b` | `identifier, operator%, identifier` | yes | blocked: unknown input |
| `100%)` / `(100%)` | `…, operator%, punct)` | no | — |
| `100%,` | `number, operator%, punct,` | no | — |
| `100%%` | `number, operator%, operator%` | no | — |
| `(a+b)%` | `…, punct), operator%` | no | — |
| `50%`, `2.5%`, `.5%` | `number, operator%` | no | — |
| `100%-5` | `number, operator%, operator-, number` | yes — modulus | `0` |
| `100%(b)` | `number, operator%, punct(…` | yes — modulus | blocked: unknown input |
| `100%[0]` | `number, operator%, punct[…` | yes — modulus | blocked: type mismatch |
| `100%.5` | `number, operator%, number` | yes — modulus | `0` |
| `100%.name` | `number, operator%, punct., identifier` | yes — modulus | failure: relative field outside filter (`formula.ts:1419-1422`) |
| `2^50%` | `number, operator^, number, operator%` | no — `(2^50) %` wants an operand | — |
| `100 % 0` | — | yes | failure `divisionByZero` (shared with `/` and `//`, `formula.ts:1667-1672`) |

The parser demands an operand after binary `%` — the right side goes through `parseExpression` → `parsePrimary` (`formula.ts:509-576`, `:316-455`), which throws `expected a value` on anything that cannot begin an expression. Every `%`-terminated input is therefore a *parse error today, not an invalid token*.

**Is a purely lexical rule sufficient?** Mechanically, yes. Tokens carry `from`/`to` (`formula.ts:92-97`), so "glued" (the `%` token starts exactly where the number token ends) is well-defined, and "not followed by an operand" is lexer-local lookahead: skip whitespace, test the next character against exactly the tokens `parsePrimary` accepts — digit, `.`, quote, identifier-start, `(`, `[`, `{`, and the unary operators `-` and `!` (`formula.ts:327-396`, operator case `:355-370`; `.`-relative `:377-395`). Note the last two: unary `-` and `!` **must** count as operand-starts, or `100%-5` silently changes from modulus to a literal minus five.

The spike proves the compatibility half on a 1,080-case cross-product (6 prefixes × 5 numbers × 2 gluings × 18 suffixes): the rule rewrites 240 strings, **every one of which is a parse failure today**, and rewrites **zero** strings that parse. This is structural, not luck: binary `%` requires an expression-start token after it, which is precisely the complement of the rule's carve-out — the rule only ever consumes inputs the parser was about to reject.

**Where it gives an answer a person would not predict.** Three places, all measured:

1. **Glued-but-followed-by-operand stays modulus.** `100%3`, `100%-5`, `100%(b)`, `100%[0]`, `100%.5`, `100%.name`, and `100% 3` (space *after* the `%`) all keep remainder semantics, because an operand follows. A spreadsheet-trained author — for whom `%` never means remainder, see §6 — cannot predict that `50%(w)` computes `50 mod w`. Worse, the typo `50% 2` silently computes `0` instead of erroring.
2. **Postfix on expressions stays an error.** `(a+b)%` and `a%` remain parse errors: the rule only fires after *numeric literals*. Excel's `%` is an operator (§6), and a spreadsheet user's hand writes `=(A1+B1)%` [the doc classifies `%` among operators but does not show it applied to a parenthesized operand — inference]. Either the language accepts a postfix operator in `parsePostfix` (`formula.ts:457-507`) — a parser change, no longer a lexical rule, and one that makes `a%` legal and `(a+b)%` legal while `a %b` remains modulus — or it documents that only literals take `%`, which is un-Excel but predictable.
3. **The chained corner.** `100%%` is a parse error today; under the fold simulation it becomes `0.01` (each `%` divides by 100), while the one-token grammar variant of §2 rejects it. Whichever way it lands, it needs an explicit corpus entry so the two grammars agree.

The trade is crisp: the *lexical* rule is sufficient for compatibility; *predictability* is what it cannot deliver alone.

## 2. What changes, file by file

The diff surface of the minimal change (lexical rule + bare number, §3's option (a)):

**`packages/domain/src/formula.ts`** — the whole change can live in two places:
- `lex` (`:135-211`): the number branch (`:160-169`) grows a glued-`%` suffix with one character of extra lookahead for the not-followed-by-operand test (~10–12 lines). Either the number token's text swallows the `%` (parser untouched: `Number(token.text)` at `:329` already handles `"2.5"`, and `parsePrimary`'s number case `:328-329` plus `check`/`evaluate` literal cases `:1110`, `:1406` stay as-is for bare-number semantics), or `TokenKind` (`:82-90`) gains a `"percent"` member and the number case learns it.
- `OPERATORS` (`:99-120`) and `BINDING` (`:261-280`): **unchanged** if spaced `a % b` modulus survives; `%` deleted from both (one line each) under §5's removal variant.

No operator-table, `FormulaValue`, `FormulaType`, `evaluateBinary`, or `check` changes for the bare-number variant. Estimate: 15–25 lines, one file.

**`apps/studio/src/editors/show/graph/formula/formula.grammar`** — `Number { @digit+ ("." @digit+)? ("%")? }`, a one-token edit to line 26, regenerated with `lezer-generator` (`@lezer/generator` is a devDependency, `apps/studio/package.json:43`; no npm script wires it — the highlighting research documents the manual invocation, `docs/research/formula-editor-highlighting.md:43`). Measured on this branch: the regenerated parser is **3,169 bytes vs the checked-in 3,182** — size-neutral. But note the token edit implements the *glued-always-literal* rule (§1's sharper variant): `100%3` becomes `Number(100%) Number(3)` → rejected. The §1 lexical rule (operand lookahead) cannot be expressed in the token regex and would need a Lezer external tokenizer (~20–30 lines of TS plus grammar plumbing — the mechanism the highlighting research names for "what regexes cannot express", `formula-editor-highlighting.md:43`). Under either variant, `%` leaves the `BinaryOperator` list only if modulus is removed.

**Conformance corpus** — `formula-parser.test.ts:22-40` (17 entries today) gains entries that pin the decision: `100%`, `50%+10`, `(100%)`, `IF(c, 50%, 0)`, `100 % 3`, and — whichever way §1 lands — the glued-modulus rows (`100%3`, `100%-5`, `100%(b)`) and `100%%`. The invariant the corpus holds is accept/reject agreement (`formula-parser.test.ts:5-20`), so the evaluator and the editor grammar must move in one commit.

**Two pre-existing conformance divergences surface immediately** (verified by running the checked-in `formula-parser.ts` directly): the grammar's `BinaryOperator` list has no `^` (`formula.grammar:21`) while the evaluator supports it (`BINDING` `:279`, evaluate `:1680-1682`) — `2^3` is grammar-reject/evaluator-accept; and the grammar's `Number` requires a leading digit (`formula.grammar:26`) while the evaluator lexes `.5` (`formula.ts:160`) — same split. Neither is in the shipped corpus, so nothing fails today; both are exactly the kind of entry a `2^50%` or `.5%` corpus row would expose. Fixing them is #666 follow-up work that a percentage literal forces adjacent.

**`FormulaCodeEditor.tsx`** — no change: the literal is a `Number` node and already highlights as `tags.number` (`FormulaCodeEditor.tsx:39`); `styleTags` `:36-45` is name-keyed.

**CONTEXT.md** — the Formula glossary entry (`CONTEXT.md:101-104`) describes no operators today; a literal needs at most one sentence there, plus the scale convention §4 demands written down.

## 3. What the resulting value is

Three candidate answers, each with one worked consequence that kills its free lunch:

**(a) `100%` is the number `1`** (Excel's stored scale — a cell displaying 50% stores 0.5). Zero `FormulaValue`/`FormulaType`/operator changes; everything the spike's section 4 measured through the real evaluator:

- `50% + 10` → `10.5`; `50% * 200` → `100`; `50% + 50%` → `1` — Excel-parity arithmetic.
- `SUM([10%, 20%, 5%])` → `0.35000000000000003` — percentages inherit binary-float surprises, and the preview strip rounds to 3 decimals (`asText`, `formula.ts:1722-1723`: `Math.round(value * 1000) / 1000`), so a small literal like `0.05%` displays as `0.001` and neighbours `0.04%`/`0.06%` collide.
- Comparison and text coercion: `50% > 0.4` → `true`; `"rate: " & 50%` → `"rate: 0.5"` — `&` renders the fraction, not `50%`. The display reads wrong for exactly the people who want the syntax.

The killer: **the scale**. #706's proof artifact is `votes / total * 100` with unit `%` — the 0–100 scale of `SizeValue` (`canvas.ts:16-17`, `{ value: 50, unit: "%" }`; opacity converts ×100/÷100 at the boundary, `element-properties.ts:187-188`). Under 0–1 literals the same authoring divides by 100 again: the spike measures `votes / total * 100` → `37` but `votes / total * 100%` → `0.37` — a tally bar that renders at 0.37% of its parent. The motivating use case silently ships 100× small.

**(a′) `100%` is the number `100`** (the property's 0–100 scale): the size artifact works (`count / total * 100%` → `37`), and `50%` alone is a correct half-width bar. But arithmetic loses Excel parity by the same 100×: `50% * 200` → `10,000` where Excel gives `100`, and a Calculate node's `number` output carries a convention that means nothing to a Transformer's other consumers. The same source string means one thing in a size property and another in a Transformer, or the same wrong thing everywhere.

**(b)/(c) — the number `100` tagged as a percentage, or a new `FormulaValue` kind.** These buy both consumers being right — `50%` renders 50%-of-parent *and* `50% * 200` = `100` — but only after inventing a promotion algebra Excel itself does not have (Excel's `%` is parse-time division; there is no runtime percent type to promote — §6). The rules that must be designed, not just coded: `50% + 10` (promote 10 to 1000%? demote to a bare 10.5? block?), `SUM` over mixed arrays, comparison across the tag, `&` rendering. The measured touchpoint inventory for a new kind: `FormulaValue` (`:16-28`) and its constructor pattern (`:42-57`), `FormulaType` (`:60-66`), `typeName` (`:68-73`), `staticTypeOfValue` (`:962-975`), `asText` (`:1718`), `previewText` (`:1741-1748`), `deepEqual` (`:1699-1715`), `isSimple` (`:1693-1697`), `evaluateBinary`'s three gates — comparison (`:1627-1647`), `+`-text (`:1620-1625`), numeric (`:1649-1655`) — unary (`:1514-1525`, `:1273-1276`), `check`'s binary typing (`:1330-1379`), the catalogue's `aggregate` (`:853`), `numericExtremum` (`:881`), `roundToPrecision` (`:903`) and two parameter predicates (`:667-670`, `:676-684`), plus `formulaToRuntime`'s number gate (`formula-runtime.ts:181`) and `runtimeToFormula` (`:71-155`) — **~20 discriminating sites across two files, and a permanent per-Function tax** (every future catalogue entry's parameters must decide about the tag).

## 4. How it reaches the Property

#706 settled: the size arm is `{ kind: "formula", formula, unit?: SizeUnit, fallback }`, defaulting `px`; **the Formula returns a bare number, `expected` stays `number`, and the unit is "a visible authored choice rather than something emergent"** (resolution comment, #706; it explicitly rejected text results like `"50%"`). `resolveSizing`'s `as number` cast (`element-properties.ts:474`) is the thing both unit-carrying arms replace.

If the literal carries a tag (§3 b/c), the literal's unit and the arm's `unit` are two sources of one truth. The reconciliation options, with the inputs the ticket names:

- **Arm wins, tag is authoring sugar.** `50 * 2%`: under any semantics the arithmetic is `50 × 0.02 = 1`, so the property becomes `1px` (the arm's default). Defensible, but then the tag did nothing at the boundary — §3's ~20 sites of tag machinery exist only to be stripped in `formulaToRuntime`, and the author who wrote `2%` watching it land as 1px has learned the tag is decorative.
- **Literal wins (last-tag dataflow).** `50 * 2%` sets the unit to `%` with value `1` → renders at 1% of the parent. This is exactly the "unit emergent from the expression" behaviour #706 rejected; `50 * (1 + 2%)` style formulas would flip a px intent to `%` on a whim of the tail of the expression.
- **Conflict diagnostic.** Arm says `px`, formula's top-level value is tagged `%` → a new blocking diagnostic and a new inspector state. Honest, but it is a third thing to design, and `50 * 2%` still has to pick a unit for the *consistent* cases, which is where the real question lives.

Under §3(a) — the bare number — there is no reconciliation problem, only the scale problem, and it is binary: the size domain is 0–100 (`SizeValue`, `canvas.ts:16-17`; validated `:263-271`), so either literals are 0–100 and Transformers inherit a non-Excel convention, or literals are 0–1 and the size arm multiplies by 100 (amending #706's just-settled scale) or mis-renders by 100×. **The unit decision and the literal decision share one 100× fault line; neither can be minimal while the other is.**

## 5. Is `%` as modulus worth keeping?

**Nothing uses it.** Searched the repo, the seeds, the tests, and the catalogue:

- Production: `%` as a Formula operator exists only in `formula.ts` itself — `OPERATORS:115`, `BINDING:278`, the shared divide-by-zero arm and `left.value % right.value` at `:1667-1679`.
- Tests: `packages/domain/src/formula.test.ts` contains no `%`-as-modulus case (its `%` characters are vitest format strings, e.g. `:67`); the shipped editor corpus has none (`formula-parser.test.ts:22-40`); the only other `%`s in the domain are CSS/JS/SQL unrelated to the language (`canvas.ts:16`, `id.ts:123-134`).
- Seeds: `apps/api/src/db/seeds.ts` contains no `%` at all.
- Research: `docs/research/formula-editor-highlighting.md:54,145` *proposes* future corpus entries like `.5 * 2^3 % 4 // 2` — a proposal, not shipped; it needs updating under any outcome.
- Function catalogue: **no `MOD`** — `CATALOGUE` is IF, SUM, COUNT, MIN, MAX, ROUND, LEN, UPPER, LOWER, FIRST, LAST (`formula.ts:686-821`).

**Removing is simpler than disambiguating.** Deletion is three sites (`OPERATORS:115`, `BINDING:278`, the switch arms `:1669,:1678`) plus grammar/corpus alignment; disambiguation is §1–§4's whole apparatus. And the parity argument for keeping it was never true: the operator is JS **truncated** remainder (`-3 % 2 = -1`), while `MOD` is **floored** — "Returns the remainder after number is divided by divisor. The result has the same sign as divisor", `MOD(-3, 2) = 1`, and `MOD(n, d) = n - d*INT(n/d)` ([MOD function](https://support.microsoft.com/en-us/office/mod-function-9b6cd169-b6ee-406a-a97b-edf2a9dc24f3)). A spreadsheet user reaching for `%` gets different maths than the MOD they intended. A `MOD` Function is ~10–15 lines in `CATALOGUE` (the two-number shape is `ROUND`'s, `formula.ts:753-761`; divisor-zero reuses the `divisionByZero` failure) and becomes discoverable for free in the dialog's catalogue listing (`FormulaDialog.tsx:7-9`).

## 6. What Excel actually does

All from Microsoft's [Calculation operators and precedence in Excel](https://support.microsoft.com/en-us/excel/calculation-operators-and-precedence-in-excel):

- **`%` is an arithmetic operator, postfix in use.** The arithmetic-operator table lists exactly six: `+`, `–` (subtraction/negation), `*`, `/`, `%` ("Percent", example `=20%`), `^`. `%` is classified with the operators — it is not part of Excel's number-literal syntax.
- **Precedence: negation > percent > exponentiation.** The precedence table runs: reference operators, then `–` (negation, as in –1), then `%` (percent), then `^` (exponentiation), then `*` and `/`, then `+` and `–`, then `&`, then comparison. So `2^50%` is `2^(0.5)` in Excel — percent binds tighter than the power — and `-50%` negates before percenting. Same-precedence operators evaluate left to right.
- **No modulus operator.** Modulus appears nowhere in the operator tables; remainder is the [`MOD` function](https://support.microsoft.com/en-us/office/mod-function-9b6cd169-b6ee-406a-a97b-edf2a9dc24f3).
- **Coercion.** "When you enter a formula, Excel expects specific types of values for each operator. If you enter a different kind of value than is expected, Excel may convert the value": `="1"+"2"` → `3`; `=1+"$4.00"` → `5`; `=SQRT("8+1")` → `#VALUE!` (unconvertible text); `="A"&TRUE` → `ATRUE` (numbers and logicals become text when text is expected).

One deliberate local deviation worth naming: the Formula language *rejects* Excel's text→number coercion — `binaryType` blocks `"1" + 2` with "Use `&` to join text" (`formula.ts:1363-1377`). "Excel flavour" (#667, #664) is a shape, not a copy; the same latitude exists for `%`.

## 7. Blast radius on the other evaluation site

Transformer Formulas share `analyse`/`evaluate` wholesale; `evaluateFormula` builds the scope with `expected: formulaType(outputType)` (`formula-runtime.ts:259-355`, expected at `:278`), `analyse` blocks a result that disagrees with a declared output (`formula.ts:1067-1077`, the `outputTypeMismatch` diagnostic), and `formulaToRuntime` turns any non-number `FormulaValue` into a type-mismatch failure at its `type === "number" && value.kind === "number"` gate (`formula-runtime.ts:181`, failure `:189-195`).

- **Under §3(a)** — a bare number — a percentage literal in a Calculate node declaring a `number` output is mechanically unremarkable: it type-checks, evaluates, converts. The cost is semantic: the 0–1/0–100 convention lands on every downstream consumer, and two authors writing "the percentage" — one in a Calculate, one in a size Formula — produce numbers 100× apart with no diagnostic in sight. A Filter predicate returning a percent still fails the Boolean check as it does for any number.
- **Under §3(b)/(c)** — a tag or kind — the Calculate site is where the tag must be stripped or dies: `formulaToRuntime`'s gate rejects it (a *new* runtime failure for a Formula that reads fine), `analyse` blocks it unless `expected` is widened or `sameType` (`formula.ts:958-960`) learns percent⊆number, and `SUM`'s `NUMERIC_INPUT_PARAMETER` (`formula.ts:676-684`) rejects `[10%, 20%]` statically. Either the tag is dead weight in the only other evaluation site, or it is a new failure mode there.

---

## Costed recommendation

| Variant | Code | Hidden costs | Total |
| --- | --- | --- | --- |
| **0. Do not do this** | none | the inline affordance `count / total * 100%` stays unavailable; #706's unit control reaches the same artifact today | ~0 |
| **1. Lexical rule + bare number (0–1)** | 15–25 lines in `formula.ts` + 1-token grammar edit + corpus entries (measured size-neutral) | the motivating tally bar renders 100× small unless the size arm's scale is re-decided; preview shows `0.5` for `50%`; float display rounding | a focused day of code, a convention to re-open (#706), a permanent author trap |
| **2. Same, 0–100 scale** | same as 1 | Transformers and Excel arithmetic diverge by 100×; same string, different meaning per site | same code, worse semantics |
| **3. Tagged value / new kind** | ~20 discriminating sites in 2 files + runtime conversion | invented promotion algebra with no Excel precedent; §4's reconciliation design; new Calculate failure modes; permanent per-Function tax | 1+ week, and a language-design commitment, not a ticket |
| **(orthogonal) drop `%`, add `MOD`** | 3 deletions + ~10–15 catalogue lines | none found: zero usage anywhere; MOD is different (floored) maths anyway | half a day, spreadsheet-native, removes §1's ambiguity *class* |

**Recommendation: do not do this (variant 0), and spend the half-day on the MOD line instead if anything.** The want behind the ticket is real, but every literal variant pays for the affordance in the one place it was wanted: the size Property just standardized on a 0–100 unit (#706, `canvas.ts:16-17`), and a literal that agrees with it disagrees with Excel by 100×, while the Excel-agreeing literal breaks the Property by 100×. The only variant that satisfies both is the tagged kind — a week of permanent algebra Excel itself never shipped. If the want survives [#712](https://github.com/fauxparse/mechane/issues/712)'s prototype, the honest reopening is variant 1 with the evaluator and editor grammar moving in one commit on the *glued-always-literal* rule (no external tokenizer, corpus pins `100%3` as rejected, glued modulus sacrificed — zero usages to migrate), bare 0–1 numbers, the arm as the only unit truth — and it must re-open #706's scale decision in the same breath, which is precisely why it should not be done quietly now.

---

Run: `npx vitest run packages/domain/src/formula-percent-literals.research.test.ts` (54/54 green at commit time); grammar measurement: regenerate `formula.grammar` with `Number { @digit+ ("." @digit+)? ("%")? }` via `pnpm --filter @mechane/studio exec lezer-generator` and compare against the checked-in parser (3,169 vs 3,182 bytes; accept/reject table in §2).
