# Auditing the Formula editor's portability out of the Show editor

Research for [#707](https://github.com/fauxparse/mechane/issues/707), part of map [#704](https://github.com/fauxparse/mechane/issues/704); input to the Canvas inspector prototype ([#711](https://github.com/fauxparse/mechane/issues/711)) and its implementation slices.
Date: 2026-09-23. Claims cited to the repo's own source at `a96298a` (branch `research/formula-editor-portability`), plus first-hand measurements: the bundle figure in §3 was produced by bundling the actual lazy chunk from this checkout with the lockfile's own esbuild 0.28.1 (`apps/studio/node_modules/.bin/esbuild entry.ts --bundle --minify --format=esm --external:react --external:@mechane/domain --external:@mechane/design-system`, entry a dynamic `import()` of `FormulaCodeEditor.tsx`, then `gzip -9`), and the width figures in §6 are computed from the shipped Tailwind classes and chrome constants.

## The question

The whole Formula authoring surface lives under `apps/studio/src/editors/show/graph/formula/`. The Canvas Editor needs the same editor in an inspector row, and ADR-0010's third surface (Event payload Formulas, `docs/adr/0010-scene-level-expressions-evaluate-on-device.md:5`) will need it again. What does it actually cost to reuse it — dependencies, Transformer coupling, bundle, a home, breakage, and width?

## Headline verdicts

1. **The editor core is already generic; the Transformer lives in two well-named places.** `FormulaEditor` and `FormulaCodeEditor` take exactly `{value, scope, onChange, placeholder?, className?, autoFocus?}` over the domain's `FormulaScope` — zero Show-graph imports, zero React contexts, zero Transformer symbols. All Transformer coupling concentrates in `use-transformer-preview.ts` (scope factory) and `FormulaDialog.tsx` (preview rails), plus the hosting chrome in `TransformerInspector.tsx`.
2. **All four #675-specified features are parameterisable over `FormulaScope`; none needs rebuilding.** The `=` line, "Reading now", port-serving completion, and blocking/runtime diagnostics each read only `analyse(formula, scope)` / the scope itself. What must be *written new* for Canvas is a property-scope factory (the `transformerFormulaScope` analog) and the hosting row — not the editor.
3. **Bundle confirmed at ~122 KB gzipped for the actual chunk, lazy today, and shared, not duplicated.** `FormulaEditor.tsx:4` lazy-loads `FormulaCodeEditor`; my repro of the chunk measures **369,095 raw / 121,963 gzipped** against the same lockfile versions #666 measured, correcting #666's ~125 KB down by ~3 KB (its harness carried demo wiring). The grammar is **checked in**, not generated at build time.
4. **Two credible homes: a shared `apps/studio/src/` directory (cheapest, precedented by `VariableInspector`) or a new `packages/` package (precedented by the #151 rendering extraction, which carries a 6-item checklist). The design system is the wrong home** — ADR-0011 pushed content *out* of it, and it would drag `@codemirror/*` into every consumer including the Player.
5. **A move breaks exactly two import statements** (`TransformerInspector.tsx:28-29`, `ShowGraphEditorOverlays.tsx:22`); no story imports any formula component; the parser test moves with the directory and runs under the root vitest config from either `apps/` or `packages/`.
6. **The width premise corrects: both inspectors sit in the same 20rem sidebar and offer the same ≈272px row.** What differs is the Canvas row *pattern* (inline label/icon/unit controls), not the container. The real width pressure is historical: ~270px wraps a Formula four times, which is why #686 built the 66rem dialog with its measured 516px editor column (`FormulaDialog.tsx:5-7,54-56`).

---

## 1. Dependency inventory, per component

Directory: `apps/studio/src/editors/show/graph/formula/` — `FormulaEditor.tsx` (28 lines), `FormulaCodeEditor.tsx` (286), `FormulaDialog.tsx` (298), `use-transformer-preview.ts` (110), `formula.grammar` (33), `formula-parser.ts` + `formula-parser.terms.ts` (generated, checked in), `formula-parser.test.ts`.

### FormulaEditor.tsx — the lazy wrapper

| Kind | Symbols | Citation |
| --- | --- | --- |
| Imports | `type FormulaScope` from `@mechane/domain`; `lazy`, `Suspense` from `react`; `./FormulaCodeEditor` via dynamic `import()` | `FormulaEditor.tsx:1-4` |
| Props/types | `FormulaEditorProps { value: string; scope: FormulaScope; onChange(value: string): void; placeholder?: string; className?: string; autoFocus?: boolean }` | `FormulaEditor.tsx:6-14` |
| Contexts / hooks | none — no `use*` call, no `useContext` | whole file, 28 lines |
| Styling | Tailwind fallback div (`min-h-[4.5rem] rounded-sm border border-input …`) during chunk load | `FormulaEditor.tsx:20` |

Verdict: **fully Formula-shaped**. Its only domain symbol is the scope type.

### FormulaCodeEditor.tsx — the editor

| Kind | Symbols | Citation |
| --- | --- | --- |
| `@mechane/domain` | `CATALOGUE`, `analyse`, `previewText`, `typeName`; types `FormulaScope`, `FormulaType` | `FormulaCodeEditor.tsx:1-8` |
| `@mechane/design-system` | `cn` (only that) | `FormulaCodeEditor.tsx:9` |
| `@codemirror/autocomplete` | `autocompletion`, `closeBrackets`, `closeBracketsKeymap`, `completionKeymap`, `completionStatus`; types `Completion`, `CompletionContext` | `FormulaCodeEditor.tsx:10-18` |
| `@codemirror/commands` | `defaultKeymap`, `history`, `historyKeymap` | `FormulaCodeEditor.tsx:19` |
| `@codemirror/language` | `LRLanguage`, `syntaxHighlighting`, `defaultHighlightStyle` | `FormulaCodeEditor.tsx:20` |
| `@codemirror/lint` | `forceLinting`, `linter`; type `Diagnostic` | `FormulaCodeEditor.tsx:21` |
| `@codemirror/state` | `EditorState` | `FormulaCodeEditor.tsx:22` |
| `@codemirror/view` | `EditorView`, `keymap`, `placeholder` (as `placeholderExtension`), `tooltips` | `FormulaCodeEditor.tsx:23-28` |
| `@lezer/highlight` | `styleTags`, `tags` | `FormulaCodeEditor.tsx:29` |
| react | `useEffect`, `useRef` | `FormulaCodeEditor.tsx:30` |
| Local | `parser` from `./formula-parser` | `FormulaCodeEditor.tsx:31` |
| Hooks | `useRef` ×6 (`host`, `view`, `scopeRef`, `changeRef`, `initialValue`, `completionOpen`), `useEffect` ×4 (ref sync :186; view construction :191; external value sync :248; `forceLinting` on scope change :257) | `FormulaCodeEditor.tsx:177-259` |
| Props | `FormulaCodeEditorProps` — identical five/six fields to `FormulaEditorProps` | `FormulaCodeEditor.tsx:160-167` |
| Contexts | none | — |

**No Show-graph or Transformer import at all.** The only Show-editor assumptions are *behavioural*, in the host div:

- `className="nodrag nowheel …"` — React Flow's opt-out classes (`nodrag` stops node drags, `nowheel` stops canvas zoom) — `FormulaCodeEditor.tsx:264-267`;
- key/pointer `stopPropagation` with comments naming React Flow ("React Flow reads Backspace and the arrows as canvas commands") — `FormulaCodeEditor.tsx:271-283`;
- `tooltips({ parent: document.body, position: "fixed" })` — completion popups escape the host's `overflow-hidden` — `FormulaCodeEditor.tsx:210`.

In the Canvas inspector (DOM sidebar, no React Flow), `nodrag` is inert and stopping key/pointer propagation is harmless-to-desirable; the classes travel as dead weight, not as breakage.

Also portability-relevant: `editorTheme` is written against the design system's CSS custom properties (`--font-mono`, `--color-popover`, `--color-border`, `--color-accent`, `--color-destructive`, …) — `FormulaCodeEditor.tsx:51-82` — so any consuming app must load `@mechane/design-system/styles/globals.css` (Studio does at `apps/studio/src/main.tsx:6`).

### FormulaDialog.tsx — the immersive surface

| Kind | Symbols | Citation |
| --- | --- | --- |
| `@mechane/design-system` | `Button`, `Dialog`, `DialogContent`, `DialogDescription`, `DialogTitle`, `XIcon`, `cn` | `FormulaDialog.tsx:10-18` |
| `@mechane/domain` | `CATALOGUE`, `asText`, `previewText`, `typeLabel`, `typeName`; types `FormulaDiagnostic`, `FormulaValue`, `Shape`, `ShowGraph` | `FormulaDialog.tsx:19-29` |
| react | type `ReactNode` | `FormulaDialog.tsx:30` |
| Local | `FormulaEditor`; `useTransformerPreview` + types `StudioTransformerNode`, `TransformerInputPreview` | `FormulaDialog.tsx:32-37` |
| Props | `FormulaDialogProps { graph: ShowGraph; node: StudioTransformerNode \| null; onFormulaChange(nodeId, formula); onOpenChange(open) }` | `FormulaDialog.tsx:39-44` |
| Hooks | `useTransformerPreview` only | `FormulaDialog.tsx:76` |
| Contexts | none — plain props; the Dialog is design-system chrome | — |

**Wholly Transformer-shaped**: header reads "node.name reads …" the port names (:87-92); the left rail renders `TransformerInputPreview` rows incl. Filter's item "one at a time" (:107-108) and the "keeps X of Y" count (:148); `VISIBLE_ROWS = 8` array tables (:47, :255); the right rail lists `CATALOGUE` (:162-176). `DiagnosticRow` adds the Transformer publish wording "· blocks publishing" / "· right now" (:200).

### use-transformer-preview.ts — the scope factory

| Kind | Symbols | Citation |
| --- | --- | --- |
| `@mechane/domain` | `analyse`, `defaultSourceRuntimeState`, `evaluateTransformer`, `isStructuredValueReference`, `transformerFormulaScope`, `transformerInputs`, `transformerInputType`, `transformerOutputType`; types `FormulaAnalysis`, `FormulaScope`, `FormulaValue`, `GraphNode`, `RuntimeValue`, `ShowGraph`, `StructuredValueRecord`, `Type` | `use-transformer-preview.ts:8-25` |
| react | `useMemo` | `use-transformer-preview.ts:26` |
| Types out | `StudioTransformerNode = Extract<GraphNode, { kind: "transformer" }>` (:28); `TransformerInputPreview { name; type: Type \| null; value: FormulaValue }` (:30-35); `TransformerPreview { scope; analysis; inputs; item; outputType; kept }` (:37-48) | |

Its own header states the sharing contract: "Both Formula surfaces share this… Neither may derive its own scope, or the editor's completion, its squiggles and the `=` line would disagree" (`use-transformer-preview.ts:1-7`). Internals: design-time values via `defaultSourceRuntimeState` (:63), port inputs via `transformerInputs` (:66-68), the scope via `transformerFormulaScope` (:69), Filter's `kept` via `evaluateTransformer` (:84-97), Shuffle's null analysis (:101).

### The grammar

`formula.grammar` (33 lines, checked in) → `formula-parser.ts` and `formula-parser.terms.ts`, both carrying the header "This file was generated by lezer-generator. You probably shouldn't edit it." (`formula-parser.ts:1`, `formula-parser.terms.ts:1`) — see §3 for generation. `formula-parser.test.ts` is the drift guard: it cross-checks the Lezer grammar's accept/reject against the domain evaluator's `parse` over a 17-entry corpus (`formula-parser.test.ts:5-45`).

### The consuming Show-graph inspector code (what stays behind)

- `TransformerInspector.tsx:28-29` imports `FormulaEditor` + `useTransformerPreview`; renders the editor in a full-width row (:211-220), the `=` line (:221-231), the diagnostics list (:232-250), "Reading now" (:251-271), and the maximize button that opens the dialog (:200-208) via the **React context** `useNodeInteraction` (:30, :77).
- `ShowGraphEditorOverlays.tsx:22` imports `FormulaDialog`; `TransformerFormulaDialog` (:129-140) pulls the open node from `useNodeInteraction` (:130) and hands `inspector.setTransformerFormula` to the dialog (:136).
- That context is `NodeInteractionContext` (`node-interaction.tsx:30-39`, defaults :59-61), state held in the Show controller (`use-show-graph-editor-controller.ts:99`, exposed :344-346); the edit seam is `setTransformerFormula` on `GraphInspectorEditing` (`use-graph-editing.ts:240`). The node body also opens the dialog (`TransformerNode.tsx:73-80`).

So the *components* are context-free; the *opening/closing plumbing* is Show-editor state and stays there.

## 2. Transformer-shaped versus Formula-shaped

The four #675-specified features, one by one. The abstract "context surface" already exists as the domain type: `FormulaScope { ports, shapes, itemBinding?, relativeType?, relativeItem?, expected?, budget? }` (`packages/domain/src/formula.ts:997-1009`) and `analyse(source, scope) → FormulaAnalysis` (`formula.ts:1021`).

| Feature | Where | Reads | Verdict |
| --- | --- | --- | --- |
| `=` result line | `TransformerInspector.tsx:221-231` (dialog twin :130-150) | `analysis.blocked / value / type` from `analyse(formula, scope)` | **Parameterisable as-is.** Any surface with a scope renders it. The output-Type fallback text (:142-148 dialog) is Transformer vocabulary and is presentation-side. |
| Per-port "Reading now" | `TransformerInspector.tsx:251-271` (dialog twin :104-118) | iterates `scope.itemBinding` + `scope.ports` with `previewText` | **Parameterisable as-is.** Entry names come from the scope, so a property-Formula scope listing Scene Variables renders unchanged. |
| Completion serving ports with current values | `FormulaCodeEditor.tsx:107-158` | `scope.ports` entries carry `info: "Now: ${previewText(port.value)}"` (:141); dotted chains resolve through `scope.shapes` (:84-105); functions from `CATALOGUE` (:144-155) | **Parameterisable as-is** — the strongest evidence the core was built generic: the editor already knows nothing about Transformers. |
| Split blocking/runtime diagnostics | `FormulaCodeEditor.tsx:212-226` (mapping `severity === "blocking" → "error"` else `"warning"`, 120ms delay, `forceLinting` on scope change :257-259) | `FormulaDiagnostic.severity: "blocking" \| "runtime"` (`formula.ts:981-989`, semantics from #672) | **Parameterisable as-is.** Severity is the domain's contract, not a Transformer concept. `FormulaDialog.tsx:200` adds the "blocks publishing" wording — one string. |

**What is genuinely Transformer-shaped and needs new code for the Canvas surface:**

1. **The scope factory.** `useTransformerPreview` is Show-graph + Transformer in, `FormulaScope` + Transformer extras out. Canvas needs a property analog — resolve an Element's Scene Variables into a `FormulaScope` — implemented domain-side next to `transformerFormulaScope` (`packages/domain/src/transformers.ts:59`), then a hook that is a `useMemo` exactly like `use-transformer-preview.ts:59-109`. This is #711's real work.
2. **The dialog's preview rails.** `InputBlock`/`InputValue` (:205-298) render `TransformerInputPreview` rows; "keeps X of Y" (:148) and the item binding's "one at a time" (:108) are Filter concepts. The rails parameterise cleanly over a generic `{name, type|null, value}[]` (which `TransformerInputPreview` already is, :30-35) if the kept/item annotations become optional; or the Canvas surface simply doesn't open a dialog yet.
3. **The hosting chrome** (Section label "Keep when"/"Formula", port-name editor, `Maximize2` button — `TransformerInspector.tsx:196-220`) — per-surface by design, stays.
4. **Vocabulary debt inside the "generic" layer**: `FormulaScope`'s doc comments say "the node's named input ports… Filter's per-item binding… Calculate's declared output Type" (`formula.ts:998-1007`) and one `analyse` diagnostic hardcodes "This Transformer has no Formula yet" (`formula.ts:1031`). Structural, not behavioural — but a Canvas scope would surface that string, so the message should grow a subject noun when reused.

One behavioural note: the `nodrag nowheel` + key-capture host (`FormulaCodeEditor.tsx:264-283`) is a React Flow contract. In the Canvas sidebar it is inert, not broken — but a shared home should either document it or take it as a `className` from the host.

## 3. Bundle cost and laziness

**Lazy today, by construction.** `FormulaEditor.tsx:4` is `const FormulaCodeEditor = lazy(() => import("./FormulaCodeEditor"))` — the eager cost of any importer is the 28-line wrapper plus its Suspense fallback (:18-23). Both current consumers (`TransformerInspector.tsx:28`, `FormulaDialog.tsx:32`) import the wrapper statically, so the heavy chunk first loads when a Formula surface actually mounts.

**Measured against this checkout.** Bundling `FormulaCodeEditor.tsx` with the repo's esbuild, react/`@mechane/domain`/`@mechane/design-system` external (they live in shared/eager chunks), `--bundle --minify --format=esm`, `gzip -9`: **369,095 raw / 121,963 gzipped**. #666's findings priced the complete stack at 381,932 / **125,041** (`docs/research/formula-editor-highlighting.md:105`) — the ~3 KB delta is #666's demo harness. **The ~125 KB figure is confirmed in order and corrected to ~122 KB for the chunk as actually wired.**

**Lockfile agreement.** `pnpm-lock.yaml` resolves exactly the versions #666 measured and minified: `@codemirror/autocomplete@6.20.3`, `commands@6.11.1`, `language@6.12.4`, `lint@6.9.7`, `state@6.7.5`, `view@6.43.12`, `@lezer/common@1.5.2`, `highlight@1.2.3`, `lr@1.4.10`, `generator@1.8.0` — matching `apps/studio/package.json:13-18,22-24,43` and the version table in `formula-editor-highlighting.md:26-33`. Only `apps/studio` declares any of them (no other manifest in the repo does).

**Shared, not duplicated.** Both the Show inspector and the Canvas editor compile into the one `apps/studio` Vite build; a dynamic `import()` of the same module yields one chunk in that build's module graph (`vite.config.ts` has no `manualChunks` — nothing re-splits it), so a second importer from the Canvas editor reuses the already-loaded chunk. Duplication only arises *across builds* (Studio vs Storybook vs Player each bundle their own copy), which is true today and unchanged by any in-repo move.

**The grammar is checked in, not build-time generated.** Evidence: `formula-parser.ts` and `formula-parser.terms.ts` are committed (`git ls-files` shows all 8 directory files, added in #687's `cef9abc`); `apps/studio/vite.config.ts:13-21` registers only `tanstackRouter`, `react`, `tailwindcss` — no Lezer plugin; no script in any `package.json` invokes `lezer-generator` (root scripts: `package.json:6-29`; studio scripts: `apps/studio/package.json:6-10`). `@lezer/generator` sits as a devDependency (`apps/studio/package.json:43`) for manual regeneration (`lezer-generator formula.grammar`); drift is held by the conformance corpus `formula-parser.test.ts:43-45`, which CI runs via root `pnpm test` → `vitest.config.ts:4` (`include: ["packages/**/*.test.ts", "apps/**/*.test.ts"]`). Consequence for a move: nothing regenerates the parser at build time in any location, so a new home changes no build step — it just carries the checked-in pair and the devDependency.

## 4. Candidate shared homes

The repo supports three; the decision is a later ticket (this section reports consequences, not a choice).

### (a) A shared `apps/studio/src/` directory — e.g. `src/components/formula-editor/`

**Precedent in place:** `apps/studio/src/components/VariableInspector.tsx` is already the shared inspector surface consumed by *both* editors — the Canvas `BlockVariablesSection` (`CanvasInspectorSections.tsx:24,48`) and the Show `Variables.tsx`. `src/components/EditorLayout/` similarly serves both.

Consequences: **none for build config.** The directory stays inside the Vite root with its aliases (`vite.config.ts:22-29`), inside `tsconfig` `include` (`apps/studio/tsconfig.json`), inside the Storybook stories glob `../../apps/studio/src/**/*.stories.tsx` and alias map (`storybook/.storybook/main.ts`), and inside the Tailwind scan `@source "../../../../apps/studio/src"` (`packages/design-system/src/styles/globals.css:9`) — so stories and utility classes keep working with zero added lines. Dependencies stay declared exactly where they're used (`apps/studio/package.json`). Dependency direction is trivial (studio-internal). Test setup unchanged (root vitest already includes `apps/**`). Cost: nothing outside Studio can import it — but nothing needs to; ADR-0010's third surface (Event payload Formulas) is Studio-authored too.

### (b) A new `packages/` package — e.g. `@mechane/formula-editor`

**Precedent:** commit `e15335b3` "chore: extract canvas rendering package (#151)" hoisted Studio code into `packages/rendering`, and its diff *is* the checklist:

1. new `packages/<name>/package.json` (+26 lines: name, `workspace:*` deps `@mechane/domain`, react) and `tsconfig.json` (+8);
2. one stories-glob line added to Storybook's config (then `apps/studio/.storybook/main.ts +1`; today `storybook/.storybook/main.ts` globs only `apps/studio/src`, `packages/design-system/src`, `packages/rendering/src`);
3. an ADR recording the boundary (`docs/adr/0011-canvas-rendering-package.md`);
4. `pnpm-lock.yaml` (+28);
5. the moved files, import-path edits at consumers;
6. — new since #151 — **a `@source` line in `packages/design-system/src/styles/globals.css`** for any package that authors Tailwind utility classes. #151 dodged this only because `packages/rendering` authors none (`canvas-renderer.tsx` has two `className` hits, both pass-through). The Formula editor authors many (the dialog, the fallback, the inspector rows), so `@source "../../../../packages/formula-editor/src"` is *required* or its classes silently vanish from every app stylesheet.

Also decide: the `@codemirror/*`/`@lezer/*` deps move from `apps/studio/package.json:13-24,43` into the package (Studio uses them nowhere else — verified by grep), and the single `cn` import (`FormulaCodeEditor.tsx:9`) either adds `@mechane/design-system` as a dep of the new package (heavy but acyclic) or the host supplies composed classes. Root vitest picks up `packages/**/*.test.ts` automatically (`vitest.config.ts:4`). Dependency direction: `formula-editor → domain` (+ optionally design-system), `studio → formula-editor` — clean.

### (c) The design system, `packages/design-system`

Technically reachable — design-system already depends on `@mechane/domain` (`packages/design-system/package.json`), so `FormulaScope` is importable. But it is the wrong shape by this repo's own doctrine: ADR-0011 keeps the design system to "theme tokens and application-chrome components" and pushed *content* rendering out to a dedicated package; a code editor with live-data completion is authoring surface, not chrome. Concrete cost: eight new dependency families in the package every app imports — the Player depends on `@mechane/design-system` (`apps/player/package.json`), putting the editor modules in Player's build graph for no feature, and the design-system Storybook build would bundle CodeMirror for every chrome story. No precedent supports this direction; the one precedent involving design-system and a package move goes the other way.

### Sizing note for any home

`FormulaCodeEditor` + grammar is editor-machinery (§1); `FormulaDialog` is a Transformer surface (§2). A split at that seam — generic core shared, dialog left with the Show editor until a parameterised workbench is wanted — is available at any of the homes and costs nothing extra in build terms.

## 5. What a move breaks

- **Import statements: exactly two external consumers.** `apps/studio/src/editors/show/graph/inspector/TransformerInspector.tsx:28-29` and `apps/studio/src/editors/show/ShowGraphEditorOverlays.tsx:22` (both plain relative imports; nobody reaches the directory through the `@show-editor` alias). The dialog's imports of its siblings (`FormulaDialog.tsx:32-37`) move with the files.
- **Tests:** one — `formula-parser.test.ts` lives in the directory, imports `./formula-parser` relatively and `@mechane/domain` (`formula-parser.test.ts:1-3`), and runs from either `apps/**` or `packages/**` under the root vitest include (`vitest.config.ts:4`). No other test file imports anything from the directory (grep across `apps/studio/src`).
- **Stories:** none. No `*.stories.tsx` in the repo imports `FormulaEditor`, `FormulaDialog`, or `TransformerInspector` (grep). The Show editor's `Inspector` story (`ShowGraphEditor.stories.tsx:104`) exercises the inspector only through the full editor, so a path change inside the module is invisible to it.
- **Build config:** none for the `apps/studio/src` home; the §4(b) checklist (package.json, tsconfig, Storybook glob, globals.css `@source`, lockfile, ADR) for a `packages/` home. Forgetting the `@source` line is the one silent failure mode.
- **Precedent:** the #151 extraction (`e15335b3`) is exactly this class of hoist, down to moving stories and tests with the code; it also demonstrates the ADR habit (`docs/adr/0011`).

## 6. Width and layout assumptions

**The editor declares no minimum width.** The host div is a plain block with `overflow-hidden rounded-sm border` and no width class (`FormulaCodeEditor.tsx:262-267`); the document wraps (`EditorView.lineWrapping`, :208) at whatever width it gets; the only minimum is *vertical* — `.cm-content { minHeight: 4.5rem }` (:56), the wrapper fallback `min-h-[4.5rem]` (`FormulaEditor.tsx:20`), and the dialog's `min-h-[7rem]` usage (`FormulaDialog.tsx:122`). Completion and lint tooltips are re-parented to `document.body` with `position: fixed` (:210), so popups never clip against a narrow host — the two facts that make a narrow container workable at all.

**Both inspectors sit in the same sidebar.** The Canvas editor is nested inside the Show route's chrome: `$showId.tsx:100-103` wraps the `<Outlet/>` in `EditorLayout`, and `art.tsx:405` renders `CanvasWorkspaceEditor` within it; both editors fill the same `EditorSlot name="right"` (`ShowGraphEditorOverlays.tsx:66`, `CanvasWorkspaceEditor.tsx:410`). That chrome is `DEFAULT_SIDEBAR_WIDTH = "20rem"` (`EditorLayout.tsx:24`, applied as `--sidebar-width` at :92) on a floating `Sidebar` with `p-2` (`packages/design-system/src/components/ui/sidebar.tsx:154`), and both inspectors use the same `Section`/`SectionRow` primitives with `SidebarGroupContent … p-4` (`packages/design-system/src/components/inspector-section.tsx:24`; Canvas sections import them, e.g. `PositionSection.tsx:1`). At the default 16px root (no override in `apps/studio/index.html` or `globals.css`), the row content width is 320 − 16 (floating `p-2`) − 32 (`p-4`) = **≈272px in both** — matching the "270px column" note in `FormulaDialog.tsx:2`. The Canvas `SidebarContent` adds nothing (`vibe: "inspector"` → `p-0`, `sidebar.tsx:203-204`; `InspectorProvider` defaults to inspector vibe, `inspector-vibe.tsx:19-21`).

**So the ticket's premise corrects: the Canvas inspector sidebar is not narrower than the Show inspector's — same chrome, same ≈272px Section row.** What differs is the row *pattern*: Canvas property rows are `PropertyInput` controls that spend the row on an icon, inline label/unit and variable chips (`packages/design-system/src/components/ui/property-input/property-input.tsx:91-148`, chips `max-w-[55%]` at `addons.tsx:76`), where the Show Formula row gives the editor the full 272px (`SectionRow className="grid-cols-[1fr]"`, `TransformerInspector.tsx:211`). A Canvas Formula row that follows the `PropertyField` pattern will have *less* than 272px for the editor itself.

**The width pressure is real nonetheless, and documented.** At ~270px "a Formula wraps four times"; the #686 dialog exists to give "a measured 516px editor, where a Formula wraps twice instead of four times" (`FormulaDialog.tsx:5-7`) — the 66rem dialog with `grid-cols-[17rem_1fr_15rem]` rails (:54-56, :104) leaves its middle column 34rem = 544px minus `p-3` padding ≈ 520px (the comment's "measured 516px" accounts for borders). For #711 that means: the editor *functions* at 272px (wrapping, fixed-position tooltips, 4.5rem height), it is just cramped for long Formulas — the same constraint the Show inspector already lives with, and the reason the maximize-to-dialog affordance exists there (`TransformerInspector.tsx:200-208`).
