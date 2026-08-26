# UI component defaults audit

Date: 2026-08-25

## Question

Which defaults in `@mechane/design-system` are repeatedly overridden by consumers, especially through Tailwind classes, and could move into the component API to reduce duplicated styling and improve consistency?

## Scope and method

- Scanned consumer TSX under `apps/`; production callsite counts exclude design-system implementations and examples.
- Recorded Storybook/component stories separately as visual coverage. Stories are descriptive examples, not evidence against changing a default.
- Compared repeated `className` utility tokens and exact class bundles, then checked the current implementation defaults before proposing a change.
- A repeated class is not automatically a global `vibe`: layout, styling, and semantic state are often local concerns. Recommendations distinguish a direct default change from a named variant/preset when semantics are scoped.

## Executive finding

The strongest repetition is an **editor-inspector style**. Three `SelectTrigger` callsites use the same compact, full-width, borderless field treatment; three `SidebarContent` callsites remove the component's padding; both application textareas use the same taller, vertically resizable treatment; and all eight application `Toggle` callsites request the small size.

These are now treated as legitimate default-change candidates based on production usage. Where a primitive may have multiple future semantic contexts, a named preset remains the lower-risk API. The audit does **not** support changing `Button`'s global variant to `ghost`, `Sidebar`'s global side/variant, or generic spacing defaults: those production overrides are semantically mixed.

## Repeated overrides and proposed changes

### 1. `SelectTrigger`: compact inspector defaults

| Evidence | Current default | Proposed change |
| --- | --- | --- |
| `apps/studio/src/editors/canvas/components/CanvasInspector/CanvasInspectorSections.tsx:185`; `TextSection.tsx:331`; `StrokeSection.tsx:92` | `SelectTrigger` defaults to `size="default"`; its base style is a bordered, `w-fit` trigger (`packages/design-system/src/components/ui/select.tsx:31-60`) | Make the compact inspector treatment the default, or introduce an `inspector` preset if the component is expected to serve another product surface. The treatment is `size="sm"`, `w-full`, `rounded-sm`, `border-0`, `bg-muted/50`, and `px-2`, with one dark-mode rule. Migrate all three callsites and remove the duplicated classes and size prop. |

All three production uses pass `size="sm"` and the same five layout/surface utilities. `dark:bg-muted/50` is present in two of the three; centralizing the treatment also removes that inconsistency. The stories remain visual examples and should be updated to make whichever generic/default and inspector states are intentionally supported explicit.

### 2. `SidebarContent`: flush default or vibe

| Evidence | Current default | Proposed change |
| --- | --- | --- |
| `apps/studio/src/editors/canvas/components/CanvasLayers.tsx:502`; `CanvasInspector/CanvasInspector.tsx:26`; `apps/studio/src/editors/show/graph/inspector/SingleNode.tsx:20` | `SidebarContent` supplies `p-2` (`packages/design-system/src/components/ui/sidebar.tsx:191-198`) | Change the default to `p-0` if the design-system's primary contract is the current editor; otherwise add a `flush`/`inspector` vibe option and use it at the three callsites. |

`p-0` is present at 3/3 production `SidebarContent` callsites. The current story's padded examples do not count against this change; they should be updated or made explicit according to the desired default contract.

### 3. `Textarea`: taller resizable default or editor variant

| Evidence | Current default | Proposed change |
| --- | --- | --- |
| `apps/studio/src/editors/canvas/components/CanvasInspector/TextSection.tsx:401`; `apps/studio/src/editors/show/graph/inspector/SourceValueDialog.tsx:58` | Base class uses `min-h-16` and does not set `resize-y` (`packages/design-system/src/components/ui/textarea.tsx:5-15`) | Change the default to `min-h-40 resize-y` if all product textareas are editor-like; otherwise add a named `editor`/`multiline` variant containing those utilities and migrate both callsites. |

This exact bundle occurs at 2/2 production textarea callsites. Stories are coverage examples, not a reason to retain the compact default.

### 4. Graph-node quiet action button variant

The exact class bundle is duplicated at:

- `apps/studio/src/editors/show/graph/nodes/BaseNode.tsx:89-95`
- `apps/studio/src/editors/show/graph/nodes/FlowNode.tsx:71-82`

Both use `variant="ghost"`, `size="icon"`, and:

```text
text-(--flow-muted-foreground) hover:text-(--flow-muted-foreground)
bg-transparent hover:bg-transparent opacity-50 hover:opacity-100
```

Add a semantic `quiet`/`graphAction` button variant (or a graph-local wrapper) for the color, transparent surface, and muted opacity. Keep `size` explicit because the adjacent graph action at `BaseNode.tsx:107-113` is an `icon-sm` action with different positioning. This removes an exact duplicate without changing the meaning of generic ghost buttons.

### 5. Compact destructive alert variant

The exact class bundle is duplicated in the publish menu:

- `apps/studio/src/components/Header/Header.tsx:364-367`
- `apps/studio/src/components/Header/Header.tsx:369-372`

```text
mb-1 rounded-sm border-0 bg-destructive/25 p-2
text-destructive-foreground ring-1 ring-destructive
```

Add an `Alert` variant such as `menu-destructive` (or a compact destructive preset) and migrate both callsites. The existing `Alert` already has semantic variants in `packages/design-system/src/components/ui/alert.tsx:6-19`; extending that API is more consistent than repeating a stronger surface/ring treatment at each callsite. Keep the outer `mb-1` as menu layout unless the same spacing is observed elsewhere.

### 6. Header editor-tab pill variant

Both `TabsTrigger` entries in `apps/studio/src/components/Header/Header.tsx:244-258` pass the same class bundle:

```text
rounded-[100vw] border-0 px-3
```

Add a `pill`/`compactPill` `TabsTrigger` variant (the current component has no trigger variant API; see `packages/design-system/src/components/ui/tabs.tsx:47-61`) and remove the repeated classes. Keep `TabsList`'s `pointer-events-auto rounded-[100vw] bg-muted/50 backdrop-blur-sm` local to this header because it is a navigation-surface treatment, not a universal tabs-list default.

## Button and InputGroup detail

### `Button`

Production inventory: 41 openings.

| Override | Count | Evidence / decision |
| --- | ---: | --- |
| `variant="ghost"` | 21/41 | The most common variant, but still semantically mixed with primary, outline, link, destructive, and default actions. Do not make `ghost` the global default. |
| `size="sm"` | 11/41 | Common in compact chrome, but mixed with `lg`, `icon`, `icon-sm`, and `icon-xs`. Keep explicit unless the component becomes editor-first. |
| `size="icon-sm"` | 8/41 | Strong icon-action cluster. The exact `variant="ghost" size="icon-sm"` combination occurs 8 times across inspector, graph, and variable controls. Consider an explicit `iconAction` preset, but do not change the base Button size. |
| `variant="ghost" size="icon"` | 4/41 | All four are icon-only chrome actions, but their local classes and semantics differ. A semantic icon-action variant can consolidate the shared behavior without changing generic Button defaults. |
| `className="rounded-r-none border-0"` | 2/41 | Exact split-button body bundle at `apps/studio/src/components/Header/Header.tsx:332` and `:340`. Add a split-button/body variant if this pattern grows; do not put it in the base Button. |
| Graph quiet-action class bundle | 2/41 | Exact duplicate at `BaseNode.tsx:89-95` and `FlowNode.tsx:71-82`; covered by the graph-action recommendation above. |

The earlier `22/44` and `14` figures included three Storybook openings. They were descriptive examples, not production evidence; the production counts above exclude them.

### `InputGroup` and children

Production inventory: 6 `InputGroup`, 7 `InputGroupAddon`, 3 `InputGroupButton`, and 6 `InputGroupInput` openings.

| Component / override | Count | Evidence / proposed change |
| --- | ---: | --- |
| `InputGroup size="lg"` | 3/6 | All three are the auth fields at `apps/studio/src/components/AuthForm.tsx:152,169,187`. The existing `lg` variant already centralizes the shared height, muted background, and border treatment; keep it as a named variant rather than making it global. |
| `InputGroup` `border-0` | 3/6 | `Toolbar.tsx:93`, `CanvasLayers.tsx:503`, and `Variables.tsx:144`. These are three different composites, so border removal should remain layout-specific. |
| `InputGroup` `bg-muted/50` | 2/6 | `Toolbar.tsx:93` and `Variables.tsx:144`; the surrounding geometry differs. Do not make it a base default. |
| `InputGroupButton size="icon-xs"` | 3/3 | All three buttons are the zoom controls at `apps/studio/src/editors/canvas/Toolbar/Toolbar.tsx:106,114,122`. The component currently defaults to `size="xs"` (`packages/design-system/src/components/ui/input-group.tsx:76-109`). Change the child default to `icon-xs`, or add a compact-controls preset, and remove the three redundant props. |
| `InputGroupAddon align` | 2/7 explicit; 5/7 implicit | The implicit default is already `inline-start`; the explicit values are one `inline-end` toolbar addon and one redundant `inline-start`. No default change needed. |
| `InputGroupInput` consumer classes | 1/6 | Only the toolbar zoom field adds `w-16` (`Toolbar.tsx:98`). No repeated child class override found. |

The strongest previously undercounted opportunity is therefore `InputGroupButton`: its `icon-xs` override is 3/3 and maps directly to an existing size variant.
## Shared inspector variant contract

The recommended API is a shared **`vibe="inspector"`** contract, optionally supplied by an `InspectorProvider` around each Canvas or graph inspector. Use `vibe`, not `variant`, as the cross-component name: `Button`'s existing `variant` is a semantic surface choice (`default`, `outline`, `ghost`, `destructive`, `link`), while inspector vibe is geometry and control chrome. An explicit component prop should override provider context.

### Common contract

`vibe="inspector"` means:

- compact control height (`h-7` where the primitive has a rectangular control);
- `rounded-sm`;
- compact horizontal padding (`px-2` or the component's icon equivalent);
- muted inspector surface (`bg-muted/50`, with the dark-mode rule centralized);
- borderless field chrome where the component is a field;
- existing focus, disabled, invalid, and keyboard behavior unchanged.

### Component matrix

| Component used by Canvas or graph inspectors | Inspector behavior | Migration target |
| --- | --- | --- |
| `Button` | Compact text/button chrome; preserve semantic `variant`; keep icon sizes explicit | Replace repeated small/ghost/icon bundles with `vibe="inspector"` plus semantic variant |
| `Input` | `h-7 rounded-sm border-0 bg-muted/50 px-2` | Replace direct field class overrides and let `InputGroupInput` inherit vibe |
| `InputGroup` | Compact height, muted surface, borderless field shell | Replace repeated `border-0`, `bg-muted/50`, and `h-10`/rounded combinations where they describe inspector chrome |
| `InputGroupAddon` | Compact vertical alignment and padding | Inherit vibe; retain explicit start/end alignment |
| `InputGroupButton` | Compact icon action; `icon-xs` under inspector vibe | Remove the three toolbar `size="icon-xs"` props |
| `InputGroupInput` / `InputGroupTextarea` | Compact control height and field chrome | Inherit vibe from `InputGroup`; retain content-specific width/type |
| `SelectTrigger` | `size="sm"`, full-width, rounded-small, borderless muted field | Remove the identical Canvas inspector class bundle |
| `Toggle` | Small control size and compact padding | Remove the eight repeated `size="sm"` props |
| `ToggleGroup` / `ToggleGroupItem` | Small items, compact group gap/radius; group vibe propagates to items | Consolidate the inspector subset without changing non-inspector groups |
| `Textarea` | `min-h-40 resize-y` for editor text fields, plus compact chrome | Remove the two repeated editor class bundles |
| `Switch` | Small switch dimensions where used as an inspector field control | Preserve switch semantics; only vibe changes dimensions |
| `Slider` | Compact track/thumb geometry and inspector surface alignment | Add only if visual review confirms the current inspector slider needs the same vibe |
| `ComboboxInput` | Compact, borderless muted field treatment | Make `PropertyInput`'s internal combobox consume the same vibe instead of owning a parallel class bundle |
| `PropertyInput` | Use inspector vibe by default; preserve its variable, sizing, and validation behavior | Remove duplicate internal inspector-only assumptions only after the shared primitive styles land |
| `TypeSelect` | Forward vibe to its trigger; remove `triggerSize="sm"` and repeated `triggerClassName` styling | Keep menu/tooltip semantics unchanged |
| `Label` | Optional compact typography/alignment only; no surface or border rules | Add vibe only if inspection shows repeated label overrides |

`Section`, `SectionRow`, `SectionHelperText`, `SidebarContent`, and `SidebarHeader` are inspector shell components already: their defaults are scoped to the inspector layout and should remain the structural shell rather than participate in the field-vibe contract.

`Dialog`, `Tabs`, `DropdownMenu`, `Tooltip`, `ImageInput`, and `CopyButton` are used from inspector flows but are overlays, navigation, upload, or action primitives rather than inline inspector controls. Keep their semantic variants separate; do not force the field-vibe contract onto them.

### Provider and migration shape

Wrap both inspector roots with the same provider:

```tsx
<InspectorProvider>
  <CanvasInspector />
</InspectorProvider>
<InspectorProvider>
  <GraphInspector />
</InspectorProvider>
```

Components resolve `vibe` from the nearest provider, while a local `vibe` prop can opt a single control out. This removes repeated `vibe="inspector"` props and makes Canvas and graph inspectors converge on one visual contract.

## Repeated but not safe as global defaults

| Component / override | Evidence | Decision |
| --- | --- | --- |
| `ToggleGroup size="sm"` / `ToggleGroupItem size="sm"` | 4/9 groups and 7/18 items use `sm`; other production groups use the default | Add an inspector vibe; do not alter the generic default outside the inspector without deciding whether all group contexts share the same vibe. |
| `ToggleGroup w-full` | 6/9 groups | Width is layout-dependent; keep it at the parent/layout layer. The object-position and alignment groups also have grid-specific classes that must not become a group default. |
| `InputGroup` custom surface bundles | `border-0` at 3/6, `bg-muted/50` at 2/6 | Keep layout-specific. The three groups have different surrounding geometry. |
| `PropertyInput min={0}` | 6 production number inputs | This is domain/field validation, not visual styling. Do not move it into the generic default; some number inputs legitimately need another lower bound or no bound. |
| `Sidebar variant="floating"`, `collapsible="offcanvas"`, and `side="right"` | The editor layout uses floating/offcanvas for both sidebars; right is used for the properties panel | Keep explicit. The left Layers sidebar and right Properties sidebar have different semantics. |
| `TypeSelect triggerClassName="w-full"` | 2/3 application uses | Width belongs to the surrounding form grid; the third trigger intentionally supplies a transparent, borderless interaction treatment. |

## Recommended implementation order

1. Add one `InspectorProvider`/vibe context and mount it at both Canvas and graph inspector roots.
2. Implement the shared `vibe="inspector"` contract for `Input`, `InputGroup` and children, `SelectTrigger`, `Toggle`, `ToggleGroup`, `ToggleGroupItem`, `Button`, `Textarea`, and the custom `PropertyInput`/`TypeSelect` controls.
3. Remove the proven redundant overrides: compact SelectTrigger classes, `SidebarContent p-0`, `Textarea min-h-40 resize-y`, eight Toggle `size="sm"` props, and three `InputGroupButton size="icon-xs"` props.
4. Decide whether editor-first defaults should become the component defaults or remain provider-scoped; stories do not answer this question.
5. Add semantic variants for graph actions, split-button bodies, compact destructive alerts, and Header tab pills.
6. Update stories as descriptive visual coverage for the selected contract, then run component-specific typecheck and smoke verification.

## Risks and migration notes

- Tailwind merge order matters. A variant must be composed before consumer `className` so an explicit callsite override remains possible; verify the resulting class string and dark-mode surface.
- `p-0` on `SidebarContent` changes the content box, not only visual whitespace. Check scrollbars, keyboard focus rings, and nested groups after migration.
- The `SelectTrigger` preset changes width and border treatment. Verify mixed-value inspector states, focus rings, and dark mode, not just the closed control.
- Semantic variants should preserve existing DOM/data-slot attributes and keyboard behavior; this audit proposes styling/API consolidation only.
- Do not remove local classes until the selected default or preset is used at every cited callsite and visual coverage has been updated to document the resulting states.

## Conclusion

The shared abstraction should be a **vibe/inspector context**, not a new semantic `variant` overloaded across unrelated components. It gives Canvas and graph inspectors one contract for compact height, radius, padding, muted surface, border treatment, and child propagation while preserving each component's semantic variants and behavior. Make those defaults global only if the design-system is intentionally editor-first; otherwise provider-scoped inspector vibe removes the duplicated code without forcing editor chrome onto unrelated surfaces. Stories are descriptive and do not veto either choice.
