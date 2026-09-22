# Choosing the JEXL vendoring target: which fork, and what the fork surface is

Research for [#665](https://github.com/fauxparse/mechane/issues/665), part of map [#664](https://github.com/fauxparse/mechane/issues/664); input to the Formula language decision tickets that follow (function catalogue, validator walk, operator semantics).
Date: 2026-09-22. All claims cited to primary sources: npm registry metadata (`npm view`), repository source read at pinned tags/commits, and licence files as distributed in each repo. No blog posts, no README claims taken on trust where source contradicts them.

## The question

Charting settled that JEXL is vendored, not depended on, because stock JEXL's `Identifier` handler silently first-elements an array on field access. So the axis is "best starting point," evaluated against: synchronous evaluation (and how deep the promise machinery goes), TypeScript source, ESM for the Player bundle, who has fixed the array first-element branch and what else diverges, licence, and unpacked size. Plus the AST node inventory, because a downstream ticket writes a validator walk that must cover every node type the parser can emit.

## Headline findings

1. **Recommendation: vendor `TomFrost/Jexl` at tag `v2.3.0`.** Every change the Formula spec requires lands in one file of handler functions (`lib/evaluator/handlers.js`, 170 lines), one grammar table (`lib/grammar.js`), and the two thin orchestration files (`Evaluator.js`, `Expression.js`) — a fork surface of roughly 300 lines inside a 1,467-line core whose behaviour is documented by four years of ecosystem tooling built on exactly this AST. The trade-off is accepting an upstream that is dormant (last real commit 2021) — which is the point of vendoring: we become the upstream.
2. **The sync story is better than the ticket assumed.** Stock 2.3.0 already ships a synchronous evaluator: `jexl.evalSync()` is public API, implemented by injecting a synchronous thenable (`PromiseSync`) in place of `Promise` ([`lib/Jexl.js:177`](https://github.com/TomFrost/Jexl/blob/v2.3.0/lib/Jexl.js), [`lib/Expression.js:50-54`](https://github.com/TomFrost/Jexl/blob/v2.3.0/lib/Expression.js)). Every handler is *written* in promise style, but against the injected constructor — the machinery is one parameterized layer, not pervasive native async. Making evaluation "truly" synchronous (direct returns, no thenables) is a mechanical flattening, not a redesign.
3. **Nobody in the stock lineage fixed the array first-element branch.** `firehammersolutions/jexl`, `scitara/jexl`, `digifi-io/Jexl`, and `@pawel-up/jexl` all still contain `if (Array.isArray(context)) context = context[0]`; pawel-up even re-documents it as intended behaviour ("Automatically accesses users[0].name"). Only `GMOD/jexl` removed it — along with transforms, relative filters, and half the rest of the language.
4. **pawel-up regressed on the sync criterion.** Its 4.x evaluator is `async`/`await` throughout with `PromiseSync` deleted outright — no `evalSync` exists anywhere in `src/`. Adopting it means rewriting every handler in the opposite direction from the one it just travelled.
5. **GMOD/jexl (`@jbrowse/jexl`) is the best-engineered fork and the wrong starting point.** It is fully synchronous (compiles the AST to closures once, then evaluates by calling them), TypeScript, dual ESM/CJS, zero dependencies, and actively maintained. But it is no longer JEXL-with-fixes: it adds assignment, lambdas, sequences, template literals and regex operators, deletes the transform pipe and relative filters, and bakes bcftools-derived list semantics (a comparison over a list holds if it holds for *any* element) into every operator. Vendoring it means subtracting a language we don't want before adding the one we do.
6. **The AST inventory is nine node types in the entire stock lineage** — TomFrost, firehammer, scitara, digifi, and pawel-up emit the identical set (`pawel-up/src/grammar.ts:82-92` is literally a typed union of the same nine). GMOD emits thirteen. See §3.


## 1. The candidates

Registry data via `npm view` (unpacked size, publish dates, licence field); repo data read at pinned refs. "Last commit" is the head of the default branch, excluding dependabot branches.

| Candidate | npm package | Last release | Last commit | TS | ESM | Sync eval | First-element branch | Licence | Unpacked |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `TomFrost/Jexl` | `jexl` 2.3.0 | 2020-09-15 | 2021-04-26 | ✗ (JS; `@types/jexl` exists) | ✗ (CJS `dist/Jexl.js`) | ✓ `evalSync` via `PromiseSync` | **present** (`handlers.js:106-108`) | MIT | 87,929 B |
| `pawel-up/jexl` | `@pawel-up/jexl` 4.4.2 | 2025-07-30 | 2025-07-30 | ✓ | ✓ (`"type": "module"`) | ✗ async-only, `PromiseSync` deleted | **present** (`Evaluator.ts:662-665`) | MIT | 822,116 B |
| `firehammersolutions/jexl` | `@firehammer/jexl` 1.3.0 | 2023-10-24 | 2023-10-24 | ✗ | ✗ | ✓ inherits stock `evalSync` | **present** (`handlers.js:107`) | MIT (three copyright lines) | 87,477 B |
| `scitara/jexl` | — not on npm | — (tag 1.1.1) | 2023-03-22 | ✗ | ✗ | ✓ inherits stock `evalSync` | **present** | MIT | — |
| `digifi-io/Jexl` | `@digifi/jexl` 1.1.19 | 2026-06-19 | 2026-06-19 | ✗ (JS + hand-written `index.d.ts`) | ✗ | ✓ `evalSync` + `evalSyncPreCompiled(ast)` | **present** (`handlers.js:148`) | MIT | 110,173 B |
| `GMOD/jexl` | `@jbrowse/jexl` 5.0.2 | 2026-09-21 | 2026-09-21 | ✓ | ✓ (dual: `exports.import` esm, `exports.require` dist) | ✓ compile-to-closures, no promises anywhere | **absent** — plain member read + host hook | MIT | 764,284 B |
Package pages (registry metadata: versions, publish dates, unpacked sizes, licence fields): [`jexl`](https://www.npmjs.com/package/jexl) · [`@pawel-up/jexl`](https://www.npmjs.com/package/@pawel-up/jexl) · [`@firehammer/jexl`](https://www.npmjs.com/package/@firehammer/jexl) · [`@digifi/jexl`](https://www.npmjs.com/package/@digifi/jexl) · [`@jbrowse/jexl`](https://www.npmjs.com/package/@jbrowse/jexl) · [`@types/jexl`](https://www.npmjs.com/package/@types/jexl).

Other packages examined and set aside: `@hypatiatech/jexl` (4.10.5, 2025-12-03) is a derivative of the pawel-up tree (same `json-schema` dependency, same `lib/index.js` layout) whose npm `repository.url` (`github.com/hypatiatech/jexl`) returns 404 — no source provenance, disqualified for vendoring. `jexl-extended` (2.0.4, 2026-08-02) is a *function library layered on stock `jexl`*, not a fork. `mozilla/jexl-rs` is Rust. `@digifi/jexl`'s npm `repository.url` points at `TomFrost/jexl`; the real source is `digifi-io/Jexl`.

### TomFrost/Jexl 2.3.0 — the dormant original

MIT (`LICENSE.txt`, © 2020 Tom Shawver). Last release 2020-09-15 (`npm view jexl time`). The default branch head is `Merge pull request #104` (2021-04-26, "add support for literals as keys" — object literal keys can be string literals); the repo's 2023 `pushed_at` is dependabot branches only (`git ls-remote --heads` shows nothing but `dependabot/npm_and_yarn/*`). 47 open issues, 661 stars. Runtime dependency: `@babel/runtime` (the *published* `dist/Jexl.js` is Babel-compiled CJS; the `lib/` source we would vendor has no imports at all). Unpacked 87,929 B.

The promise machinery, precisely: the `Evaluator` constructor takes a `promise` parameter defaulting to `Promise` ([`lib/evaluator/Evaluator.js:24-33`](https://github.com/TomFrost/Jexl/blob/v2.3.0/lib/evaluator/Evaluator.js)); `Expression.eval` passes real `Promise`, `Expression.evalSync` passes `PromiseSync` and throws if the result captured an error ([`lib/Expression.js:39-54`](https://github.com/TomFrost/Jexl/blob/v2.3.0/lib/Expression.js)). `PromiseSync` is a synchronous thenable: `then` runs its callback immediately, errors are stored as values, and `PromiseSync.all` unwraps by looping ([`lib/PromiseSync.js`](https://github.com/TomFrost/Jexl/blob/v2.3.0/lib/PromiseSync.js)). Promise *touchpoints*: all nine handlers, `evalArray`/`evalMap`, both `_filter*` helpers, and the grammar's own `&&`/`||` implementations (they call `.then()` on the left operand's result, [`lib/grammar.js:91-110`](https://github.com/TomFrost/Jexl/blob/v2.3.0/lib/grammar.js)). But because the sync path is upstream, public, and tested, none of it has to *come out* for correctness — only for directness.

### @pawel-up/jexl 4.4.2 — TypeScript, async-only

MIT. Maintained by Paweł Uchida-Psztyc (`@jarrodek`, solo), forked from TomFrost; first release 3.0.0 2021-12-03, then a 3.5-year gap, then 3.2.0 → 4.4.2 in July 2025 (npm time index) — bursty, one-maintainer cadence. TypeScript source in `src/`, published ESM-only with `.d.ts`; one dependency (`json-schema`, for its function-argument validator). Unpacked 822,116 B (it ships `lib/` + `src/` + examples + JSON schemas for every built-in function).

What it genuinely adds over stock: `null` and `undefined` literals in the lexer ([`src/Lexer.ts:293-296`](https://github.com/pawel-up/jexl/blob/v4.4.2/src/Lexer.ts)); unary `+`/`-` by overloading the binary eval with `arguments.length` ([`src/grammar.ts:148-167`](https://github.com/pawel-up/jexl/blob/v4.4.2/src/grammar.ts)); `||` split to its own precedence (5, below `&&`'s 10); typed result helpers `evalAsString`/`evalAsNumber`/`evalAsBoolean`; a `Validator` class (lexical + syntactic checks, plus JSON-Schema function-argument validation) and a built-in function catalogue (`src/definitions/{math,string,date,array}.ts` with schemas). Its AST union is the stock nine ([`src/grammar.ts:82-92`](https://github.com/pawel-up/jexl/blob/v4.4.2/src/grammar.ts)).

What it costs: the evaluator is `async`/`await` in every handler with `Promise.all` fan-out ([`src/evaluator/Evaluator.ts:174-197,232-234`](https://github.com/pawel-up/jexl/blob/v4.4.2/src/evaluator/Evaluator.ts)); `PromiseSync` and `evalSync` do not appear anywhere in `src/`. And the first-element branch survived the rewrite, now documented as a feature: "*For `users.name` where users is an array // Automatically accesses users[0].name*" ([`src/evaluator/Evaluator.ts:641-667`](https://github.com/pawel-up/jexl/blob/v4.4.2/src/evaluator/Evaluator.ts)). Loose `==`/`!=` kept.

### firehammersolutions/jexl 1.3.0 — cosmetic

MIT text with accumulated copyright lines (Tom Shawver 2020, Chetan Padia 2022, Aaron Stephens 2023; GitHub's licence detector reports NOASSERTION because of the stacked notices — the file is the standard MIT text). Last release 2023-10-24. The diff against stock 2.3.0 is: Prettier house style (double quotes, semicolons), threading the raw expression string into the `Evaluator` (for error messages), and `lib/stringify.js` (AST → string). Semantics — grammar, operators, first-element branch, `PromiseSync`, `evalSync` — byte-for-byte the same decisions as stock. No reason to prefer over stock.

### scitara/jexl 1.1.1 — a published-bugfixes fork of firehammer

MIT (Tom Shawver only). Forked from firehammersolutions; its README states the motive: forked "due to the original repository suffering from lack of maintenance for 2 years at the time of this fork. No modifications have been made other than the change of a package.json in order to facilitate the publishing of a new release of already-included bug fixes." Their delta on top of that: functions are invoked with a `this` of `{astNode, context, expression}` so catalogue functions can see the whole context ([`lib/evaluator/handlers.js:155-164`](https://github.com/scitara/jexl/blob/d8994a6/lib/evaluator/handlers.js)), an `escEscRegex` global-flag fix for repeated escaped backslashes in string literals, and `stringify.js`. Head commit 2023-03-22; never published to npm under its own name (its `package.json` still says `@firehammer/jexl`). Interesting for one design seed — the `this`-context precedent for giving Formula Functions access to ambient state — but not as a base.

### digifi-io/Jexl 1.1.19 — error taxonomy, active, JS

MIT. Last commit 2026-06-19 ("Add d.ts files to library"). Keeps stock's `PromiseSync`/`evalSync` and adds `jexl.evalSyncPreCompiled(ast, context)` — evaluating a pre-parsed AST synchronously, which is exactly the render-path shape we want. But its ~150-line handler delta is an indirection layer (`nodeTransformer.transform('value')` field-renaming on every AST access) plus a bespoke error taxonomy (`MissedVariableError`, `ReadFromEmptyObjectError`), tuned to DigiFi's form-builder product; the first-element branch is untouched ([`lib/evaluator/handlers.js:148`](https://github.com/digifi-io/Jexl/blob/75e8934/lib/evaluator/handlers.js)). The AST accessor is the only idea worth lifting.

### GMOD/jexl 5.0.2 — a different language with JEXL ancestry

MIT (© 2025 Colin Diesh + © 2020 Tom Shawver). Maintained by the JBrowse core team under GMOD (the grant-funded genomics model-organism consortium); last release 2026-09-21, last commit same day. TypeScript, zero dependencies, dual ESM/CJS builds. Used in production by JBrowse 2 for per-feature config expressions.

The engineering is genuinely excellent and directly relevant to our criteria:

- **Synchronous by construction.** `compileAst` lowers the tree once into closures — `(context) => value` — resolving node types and operator bindings at compile time ([`src/evaluator/compile.ts:279-320`](https://github.com/GMOD/jexl/blob/f9ddfab/src/evaluator/compile.ts)); `Expression.eval(context)` is a plain call. No promises exist anywhere in the evaluator.
- **No first-element branch.** Field access is a plain member read with a nullish guard, overridable by a host-supplied `getMember(subject, key)` hook — auto-mapping could be injected *without touching the evaluator* ([`src/evaluator/compile.ts:353-372`](https://github.com/GMOD/jexl/blob/f9ddfab/src/evaluator/compile.ts), [`src/grammar.ts:92-100`](https://github.com/GMOD/jexl/blob/f9ddfab/src/grammar.ts)).
- **Pairwise arithmetic over arrays**: `+ - * / // % ^` map element-wise, with scalar broadcast, and unequal lengths yield `undefined` ([`src/operators.ts:56-75`](https://github.com/GMOD/jexl/blob/f9ddfab/src/operators.ts)) — the closest published precedent for our auto-mapping decision.
- **Null-aware comparisons**: `>` `<` etc. return false when either side is absent, with the comment that plain JavaScript "would read null as 0, making `[null, 0.2] < 0.05` true" ([`src/grammar.ts:132-141`](https://github.com/GMOD/jexl/blob/f9ddfab/src/grammar.ts)) — the exact class of silent wrong answer our error-value-aware operators must kill.
- It even ships a static type checker (`src/check.ts`, with `recordOf`/`union` over a small type algebra) and free-variable analysis (`src/analyze.ts`), both exported.

Why it is still the wrong base. The language grew past the Formula spec's shape: `AssignmentExpression` (`=`), `Lambda` (`=>` with closures and scope climbing), `SequenceExpression` (`;`), `TemplateLiteral` (backticks with `${}` interpolation), `~`/`!~` regex match operators, `??` — thirteen AST node types where the spec needs nine. It *deleted* the transform pipe (`|` is not in its grammar elements at all) and relative filters (`FilterExpression` has no `relative` flag; `a[expr]` is member/index access only). And the semantics that overlap our unsettled decisions are bcftools-shaped, not spreadsheet-shaped: a comparison over a list holds when it holds for *any* element (`AF > 0.05` is true if any allele's frequency exceeds — [`src/operators.ts:15-32`](https://github.com/GMOD/jexl/blob/f9ddfab/src/operators.ts)), which is the opposite pole from Excel's element-wise array formulas; `==` stays loose. Vendoring GMOD means first subtracting assignment, lambdas, sequences, and regexes from a parser/evaluator that has none of our required changes left as small diffs — every change we need sits inside machinery that is already further from stock than our whole fork would be.

---

## 2. The five criteria, resolved

1. **Synchronous evaluation.** Stock 2.3.0: solved upstream — `evalSync` + `PromiseSync`; the promise layer is injected, one file, deletable without touching the parser or lexer. firehammer/scitara/digifi inherit that solution. pawel-up: removed it; every handler is native async. GMOD: no promise machinery exists; evaluation is closure calls. *Amount that has to come out for us: stock's is a deletion of `PromiseSync.js` plus a mechanical de-`.then`-ing of nine handlers and two grammar entries — the smallest of any candidate that still has the stock AST.*
2. **TypeScript source.** Only pawel-up and GMOD are TS. But the stock AST is small and fully determined (nine nodes, §3); typing it ourselves is a one-file union (`pawel-up/src/grammar.ts:22-91` and `gmod/src/types.ts` are both copyable starting points). Stock is JS + a community `@types/jexl` (2.3.4, last published 2023-11-07) that types only the public API, not the AST.
3. **ESM.** Irrelevant post-vendoring: we take `lib/` *source*, not their `dist/`, and compile it as TS modules in our tree. (Stock ships Babel-CJS and drags `@babel/runtime`; pawel-up is ESM-only; GMOD dual.) For the Player, what ships is ~1.5k lines of our own TS; no JEXL dependency line appears in any package.json.
4. **The array first-element branch.** Present and unchanged in stock, firehammer, scitara, digifi, and pawel-up (pawel-up re-documented it as intended). Removed only in GMOD, by making field access a plain member read behind an injectable `getMember` hook. No candidate implements auto-mapping — the closest is GMOD's pairwise *operators*, which map arithmetic element-wise but give comparisons existential "any" semantics.
5. **Licence and size.** Every candidate is MIT with lineage intact (Tom Shawver's notice preserved in all six licence files; firehammer and GMOD stack additional copyright lines, which is correct practice and what we will do too). Unpacked sizes above; they measure tarballs (docs, schemas, multiple builds), not what a vendored fork costs. The vendored core (Lexer + grammar + parser + evaluator + Expression + PromiseSync-to-be-deleted) is 1,467 lines in stock, 3,172 in pawel-up (doc comments dominate), 1,863 in GMOD.

---

## 3. AST node inventory

The parser is a state machine (`lib/parser/states.js`) whose handlers build the tree; the complete set of node types the **stock lineage** (TomFrost / firehammer / scitara / digifi / pawel-up — all verified identical) can emit is **nine**. pawel-up's `ASTNode` union and the evaluator's dispatch are exactly these ([`pawel-up/src/grammar.ts:82-92`](https://github.com/pawel-up/jexl/blob/v4.4.2/src/grammar.ts)).

| Node type | Fields | Child ASTs (what a walk must recurse into) | Emitted by |
| --- | --- | --- | --- |
| `Literal` | `value: string \| number \| boolean` | — | `literal` |
| `Identifier` | `value: string`, `from?: Identifier-chain`, `relative?: boolean` | `from` | `identifier` (chains via `dot`) |
| `BinaryExpression` | `operator: string`, `left`, `right` | `left`, `right` | `binaryOp` |
| `UnaryExpression` | `operator: string`, `right` | `right` | `unaryOp` |
| `ConditionalExpression` | `test`, `consequent?`, `alternate` | `test`, `consequent` (absent in the `a ?: b` form), `alternate` | `ternaryStart`/`ternaryMid`/`ternaryEnd` |
| `ArrayLiteral` | `value: AST[]` | each element of `value` | `arrayStart`/`arrayVal` |
| `ObjectLiteral` | `value: Record<string, AST>` | each value of `value` | `objStart`/`objKey`/`objVal` |
| `FunctionCall` | `name: string`, `pool: 'functions' \| 'transforms'`, `args: AST[]` | each element of `args` | `functionCall` (functions pool) and `transform` (`x \| foo` — transforms take the subject as `args[0]`) |
| `FilterExpression` | `subject`, `expr`, `relative: boolean` | `subject`, `expr` | `filter` (`a[expr]`; `relative: true` when `expr` used `.`-prefixed identifiers, i.e. stock's `arr[.active]` filtered form) |

Two properties the validator walk must know:

- **`_parent` back-links.** During parsing, nodes get a *non-enumerable* `_parent` property ([`lib/parser/Parser.js:163-172`](https://github.com/TomFrost/Jexl/blob/v2.3.0/lib/parser/Parser.js)); completed trees keep them. They are invisible to `JSON.stringify` and `Object.keys`, but a walk must not treat them as children, and they hold up-references for as long as the AST is cached.
- **`consequent` is genuinely optional.** `a ? b : c` and `a ?: b` share one node type; the Elvis form leaves `consequent` unset and the evaluator returns the test's value ([`lib/evaluator/handlers.js:59-69`](https://github.com/TomFrost/Jexl/blob/v2.3.0/lib/evaluator/handlers.js)).

Grammar element inventory feeding those nodes (`lib/grammar.js`): punctuation `.` `[ ] { } : , ( ) ?`; binary operators `+ - * / // % ^` (precedence 30/30/40/40/40/50/50), comparisons `== != > >= < <=` and `in` (20), logical `&& ||` (10, short-circuit via `evalOnDemand`); unary `!`. Literals: single/double-quoted strings, numbers, `true`/`false` — **no `null` literal in stock** (pawel-up and GMOD both added one; stock expresses absence only via context). Loose `==`/`!=` throughout.

**GMOD's thirteen**, for contrast: the stock nine minus nothing, plus `TemplateLiteral`, `SequenceExpression`, `AssignmentExpression`, `Lambda` — and `FunctionCall` there has no `pool` (transforms deleted), `FilterExpression` has no `relative` (relative filters deleted), and `ConditionalExpression` makes `alternate` optional too.

A validator ticket written against the stock nine remains complete if it also handles: the two `FunctionCall` pools as separate catalogues to check names against, `relative` identifiers (only legal inside a `FilterExpression`'s `expr` — worth diagnosing, not forbidding), and operators as grammar-table entries rather than a closed set, since the catalogue tickets will add Excel-flavoured functions but the operator set is the fork's to own.

---

## 4. Recommendation, and the trade-off

**Vendor `TomFrost/Jexl` at `v2.3.0` (commit `29d1ac0`) into a TS module under our source tree, carrying the MIT notice with Tom Shawver's line plus ours.**

The case: every criterion the ticket weights lands in our favour. The sync path already exists upstream, so we delete a layer rather than invent one. The AST is the nine-node inventory the ecosystem already shares (`@types/jexl`, `jexl-to-string` 2.3.5, `jexl-to-estree` are all built against it), which keeps the validator ticket and any future editor tooling (autocomplete, syntax highlighting via `lang-jexl`/`highlightjs-jexl`) aligned with something documented. The lexer and parser — the parts with real edge cases (string escapes, number forms, precedence) — need no changes at all; the entire Formula-divergent behaviour is three files. And the dormancy that disqualifies stock as a *dependency* is irrelevant to a vendor: there will be no further upstream releases to track, which is precisely the frozen, understood base a fork wants.

**The trade-off, stated plainly:** we inherit no one else's fixes. Nothing from pawel-up's catalogue, validator, or TS typing; nothing from GMOD's closure compiler, null-aware comparisons, or pairwise arrays — except as *reference implementations to port by hand* (GMOD's `operators.ts` null-guards and pairwise loop are the two worth copying first, and pawel-up's typed AST union is the model for our types). We also inherit stock's loose `==`/`!=` and its no-`null`-literal grammar until we change them, and we take on sole maintenance of a parser. The alternative bases fail harder: pawel-up on sync (dealbreaker — every handler rewritten in the wrong direction, plus the first-element branch intact), GMOD on shape (a larger subtraction than our whole addition, with bcftools semantics baked into the operators), firehammer/scitara/digifi on substance (cosmetic deltas on the same base — vendoring them buys their branding and nothing else).

---

## 5. The fork surface: concrete evaluator changes the recommendation implies

Files are stock paths; the fork moves them to TS as it touches them.

1. **Replace the array first-element branch with auto-mapping** — `lib/evaluator/handlers.js:98-111` (`Identifier`). Stock: `if (Array.isArray(context)) context = context[0]; return context[ast.value]`. Fork: when `ast.from` evaluates to an array, return `context.map(item => item === null || item === undefined ? undefined : item[ast.value])`; when it evaluates to a single object, read the member as today. Indexing stays 0-based (stock's `_filterStatic` already indexes JS-style, `Evaluator.js:138-145`).
2. **Make evaluation synchronous and direct** — delete `lib/PromiseSync.js`; drop the `promise` constructor parameter from `Evaluator`; rewrite the nine handlers from `.then` chains to direct returns; `evalArray`/`evalMap` become `Array.prototype.map`; `_filterRelative` evaluates sequentially. `Expression` loses `eval` (async) and keeps only the sync shape; `Jexl.evalSync` merges into `Jexl.eval`. The `&&`/`||` grammar entries (`lib/grammar.js:91-110`) lose their `.then` short-circuit and keep the `evalOnDemand` thunk protocol, which is still the right seam for short-circuiting.
3. **Make operators error-value-aware** — `lib/grammar.js`. Stock operators are bare JS: `null < 0.05` is `true`, `"6" + 1` is `"61"`, `1/0` is `Infinity`, and absence propagates as `undefined` into every comparison. Each operator's `eval` becomes a guarded function over Typed Absence and ill-typed operands, returning an error value rather than a coerced boolean. Port the guards from GMOD's `grammar.ts:131-141` (comparisons false on absence) and `operators.ts:56-75` (pairwise/broadcast with unequal-length → error), but choose **element-wise** list semantics (Excel array-formula semantics, matching the settled auto-mapping decision), not GMOD's existential `anyPair`. Whether `==`/`!=` stay loose is a language-ticket decision; the operator table is the seam where it lands.
4. **Expose the AST** — `Expression._getAst` is private ([`lib/Expression.js:69-72`](https://github.com/TomFrost/Jexl/blob/v2.3.0/lib/Expression.js)); add a public `ast()` so the validator walk and the type checker consume the compiled tree rather than re-parsing. Lift `evalSyncPreCompiled(ast, context)` from digifi as the render-path entry point.
5. **Type the core in TS** — encode the nine-node union (model: `pawel-up/src/grammar.ts:22-91`), type the handler table as a discriminated-union switch (model: `gmod/src/evaluator/compile.ts:337-347`), and type the grammar table so operator `eval`s are functions over `FormulaValue | ErrorValue`. The lexer and parser port mechanically; their behaviour is untouched.
6. **ESM and packaging** — moot by construction: the vendored files are our TS modules; no `jexl` dependency, no `@babel/runtime`, nothing in any `package.json` but ours. The Player ships only the evaluator + grammar + the Functions catalogue it actually registers.
7. **Decide the two pools** — stock `FunctionCall` carries `pool: 'functions' | 'transforms'` (`x | upper` pipes vs `upper(x)` calls). The Formula language ticket must rule whether both surfaces exist (pipes are congenial to the audience) or only one; the fork keeps both until ruled, and the validator checks names against the pool's catalogue half.

The parser, lexer, precedence table, and transform/function registration API are inherited unchanged. Net diff estimate against `v2.3.0`: ~300 rewritten lines, ~70 deleted (`PromiseSync` + async paths), zero changes in `lib/Lexer.js` and `lib/parser/*`.
