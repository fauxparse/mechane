import { useRef, useState, type ReactNode } from "react";
import { EditorView } from "@codemirror/view";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { analyse, previewText, type FormulaScope } from "@mechane/domain/formula";
import type { ShapeValue } from "@mechane/domain/shapes";
import { InspectorProvider, OpacityIcon } from "@mechane/design-system";

import { FormulaFlyout } from "../formula/formula-flyout";
import { PropertyInput, type PropertyInputFormula, type VariableReference } from "./property-input";

const meta: Meta<typeof PropertyInput> = {
  title: "design-system/PropertyInput/Formula",
  component: PropertyInput,
};

export default meta;
type Story = StoryObj<typeof PropertyInput>;

/** An inspector Property cell is 114px; every row here is drawn at that width. */
const Cell = ({ label, children }: { label: string; children: ReactNode }) => (
  <div
    className="grid items-center gap-3"
    style={{ gridTemplateColumns: "8rem 114px" }}
    data-row={label}
  >
    <span className="text-xs text-muted-foreground">{label}</span>
    {children}
  </div>
);

const variables: VariableReference<ShapeValue>[] = [
  { id: "total", name: "Total", current: { kind: "number", value: 40 } },
];

const formula = (text: string, blocked = false): PropertyInputFormula => ({
  text,
  source: "Candidates * 10",
  blocked,
  onOpen: () => {},
});

/** Design-time values, so the `=` line and *Reading now* have something true to say. */
const scope: FormulaScope = {
  ports: [{ name: "Candidates", type: "number", value: { kind: "number", value: 5 } }],
  shapes: {},
  expected: "number",
  diagnosticSubject: "Element Property",
};

const connectorIn = (root: HTMLElement, row: string) =>
  root.querySelector<HTMLElement>(`[data-row="${row}"] [data-connector]`);

/**
 * Where the value comes from: a literal keeps its entry, with a chevron onto the menu on hover or
 * focus; a Variable, a Formula, and Fill/Hug each draw a chip that reads the resolved value, marked
 * with a plug, the Formula mark, or the sizing icon. The states are mutually exclusive. A broken
 * Variable or a blocked Formula turns its mark destructive; the value still reads.
 */
export const TriggerStates: Story = {
  render: () => (
    <InspectorProvider>
      <div className="flex flex-col gap-2">
        <Cell label="Empty">
          <PropertyInput type="number" icon={OpacityIcon} value={null} onChange={() => {}} />
        </Cell>
        <Cell label="Mixed">
          <PropertyInput
            type="number"
            icon={OpacityIcon}
            value={null}
            placeholder="(mixed)"
            onChange={() => {}}
          />
        </Cell>
        <Cell label="Literal">
          <PropertyInput
            type="number"
            icon={OpacityIcon}
            unit="%"
            value={{ kind: "number", value: 40 }}
            onChange={() => {}}
          />
        </Cell>
        <Cell label="Variable">
          <PropertyInput
            type="number"
            icon={OpacityIcon}
            value={variables[0]}
            variables={variables}
            onChange={() => {}}
          />
        </Cell>
        <Cell label="Broken Variable">
          <PropertyInput
            type="number"
            icon={OpacityIcon}
            value={variables[0]}
            variables={variables}
            brokenVariable
            onChange={() => {}}
          />
        </Cell>
        <Cell label="Formula">
          <PropertyInput type="number" icon={OpacityIcon} formula={formula("50")} />
        </Cell>
        <Cell label="Blocked Formula">
          <PropertyInput type="number" icon={OpacityIcon} formula={formula("100", true)} />
        </Cell>
        <Cell label="Fill width">
          <PropertyInput
            type="number"
            icon="W"
            dimension="width"
            sizing="fill"
            placeholder="Fill"
            value={{ kind: "number", value: 240 }}
          />
        </Cell>
        <Cell label="Hug height">
          <PropertyInput
            type="number"
            icon="H"
            dimension="height"
            sizing="hug"
            placeholder="Hug"
            value={{ kind: "number", value: 48 }}
          />
        </Cell>
        <Cell label="Fill across a selection">
          <PropertyInput
            type="number"
            icon="W"
            dimension="width"
            sizing="fill"
            placeholder="Fill"
          />
        </Cell>
        <Cell label="Fixed width">
          <PropertyInput
            type="number"
            icon="W"
            dimension="width"
            sizing="fixed"
            value={{ kind: "number", value: 240 }}
          />
        </Cell>
        <Cell label="Formula width">
          <PropertyInput
            type="number"
            icon="W"
            dimension="width"
            sizing="fixed"
            formula={{ ...formula("50%"), source: "item.votes / Total * 100%" }}
          />
        </Cell>
      </div>
    </InspectorProvider>
  ),
  play: async ({ canvasElement }) => {
    // Each row's connector, and what a chip reads: the resolved value, never the Variable's name.
    const expected: Record<string, readonly [string, string | null]> = {
      Empty: ["menu", null],
      Mixed: ["menu", null],
      Literal: ["menu", null],
      Variable: ["variable", "40"],
      "Broken Variable": ["variable", "40"],
      Formula: ["formula", "50"],
      "Blocked Formula": ["formula", "100"],
      "Fill width": ["sizing", "240"],
      "Hug height": ["sizing", "48"],
      "Fill across a selection": ["sizing", "Fill"],
      "Fixed width": ["menu", null],
      "Formula width": ["formula", "50%"],
    };
    for (const [row, [state, reads]] of Object.entries(expected)) {
      const connector = connectorIn(canvasElement, row);
      const actual = connector?.getAttribute("data-connector");
      if (actual !== state) throw new Error(`${row} shows the ${actual} connector, not ${state}`);
      if (reads !== null && connector?.textContent?.trim() !== reads)
        throw new Error(`${row} reads "${connector?.textContent?.trim()}", not "${reads}"`);
    }
    for (const row of ["Broken Variable", "Blocked Formula"])
      if (!connectorIn(canvasElement, row)?.hasAttribute("data-broken"))
        throw new Error(`${row} must mark its chip destructive`);
    for (const row of ["Variable", "Formula"])
      if (connectorIn(canvasElement, row)?.hasAttribute("data-broken"))
        throw new Error(`${row} must not mark its chip destructive`);
    const blocked = canvasElement.querySelector('[data-row="Blocked Formula"] [data-formula]');
    if (blocked?.getAttribute("data-formula") !== "blocked")
      throw new Error("A blocked Formula must mark its row");
    const empty = canvasElement.querySelector<HTMLInputElement>(
      '[data-row="Empty"] [data-slot="combobox-input"]',
    );
    if (empty?.placeholder !== "(none)") throw new Error("An empty row must read (none)");
    const formulaInput = canvasElement.querySelector<HTMLInputElement>(
      '[data-row="Formula"] [data-slot="combobox-input"]',
    );
    if (!formulaInput?.readOnly || formulaInput.value !== "50")
      throw new Error("A Formula row reads its result and cannot be typed over");
  },
};

type Stored =
  | { readonly kind: "literal"; readonly value: number }
  | { readonly kind: "formula"; readonly source: string };

/**
 * The whole authoring loop against a stub scope: *Write a Formula* from the chevron's menu (or
 * `=` over the entry), the flyout with its `=` line, Enter to apply, Esc to cancel, and the
 * Formula button to reopen — and, pressed again while open, to apply and close.
 */
function FormulaAuthoring() {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [stored, setStored] = useState<Stored>({ kind: "literal", value: 40 });
  const [draft, setDraft] = useState<string | null>(null);
  const source = stored.kind === "formula" ? stored.source : null;
  const analysis = source ? analyse(source, scope) : null;
  const start = () => {
    if (draft === null) setDraft(source ?? "");
    else apply();
  };
  const apply = () => {
    if (draft === null) return;
    setStored(
      draft.trim() === "" ? { kind: "literal", value: 40 } : { kind: "formula", source: draft },
    );
    setDraft(null);
  };
  return (
    <InspectorProvider>
      <div ref={rowRef} style={{ marginLeft: 460, width: 114 }} data-row="Opacity">
        <PropertyInput
          type="number"
          icon={OpacityIcon}
          unit="%"
          value={stored.kind === "literal" ? { kind: "number", value: stored.value } : null}
          formula={
            stored.kind === "formula"
              ? {
                  text: previewText(analysis?.value ?? null),
                  source: stored.source,
                  blocked: analysis?.blocked === true,
                  onOpen: start,
                }
              : null
          }
          menuItems={
            stored.kind === "formula"
              ? [
                  { value: "edit", label: "Edit Formula" },
                  { value: "remove", label: "Remove Formula" },
                ]
              : [{ value: "write", label: "Write a Formula" }]
          }
          onMenuItemSelect={(item) => {
            if (item === "remove") setStored({ kind: "literal", value: 40 });
            else start();
          }}
          onKeyDown={(event) => {
            if (event.key !== "=" || stored.kind === "formula") return;
            event.preventDefault();
            start();
          }}
          onChange={(next) => {
            if (next && "kind" in next && next.kind === "number")
              setStored({ kind: "literal", value: next.value });
          }}
        />
      </div>
      <FormulaFlyout
        open={draft !== null}
        anchor={rowRef}
        trigger={() => rowRef.current}
        label="Opacity"
        selectionCount={1}
        scope={scope}
        draft={draft ?? ""}
        onDraftChange={setDraft}
        canRemove={stored.kind === "formula"}
        onApply={apply}
        onCancel={() => setDraft(null)}
        onRemove={() => {
          setStored({ kind: "literal", value: 40 });
          setDraft(null);
        }}
        onReplaceAll={() => {}}
      />
    </InspectorProvider>
  );
}

// Open or opening: Base UI marks a closing popup `data-closed` and keeps its node through the exit.
const OPEN_FLYOUT = '[data-slot="formula-flyout"]:not([data-closed])';

const waitFor = async <T,>(find: () => T | null | undefined, what: string): Promise<T> => {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const found = find();
    if (found) return found;
    // The Storybook tsconfig targets a lib without `Promise.withResolvers`.
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${what}`);
};

const typeIntoEditor = async (doc: Document, text: string) => {
  const content = await waitFor(
    () => doc.querySelector<HTMLElement>(`${OPEN_FLYOUT} .cm-content`),
    "the Formula editor",
  );
  const view = EditorView.findFromDOM(content);
  if (!view) throw new Error("The Formula editor has no view");
  // Through CodeMirror, as typing is: DOM input is flushed on a frame a headless run may not paint.
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    userEvent: "input.type",
  });
  view.focus();
  return content;
};

const press = (target: HTMLElement, key: string) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

/** The authoring loop to drive by hand: a literal Opacity of 40% against a stub scope. */
export const Authoring: Story = {
  render: () => <FormulaAuthoring />,
};

/**
 * `Authoring`, played through automatically when the story opens: *Write a Formula*, Enter to
 * apply, reopen, Esc to discard, reopen, and the Formula button to apply and close. The row goes
 * 40% → 50 → 10, and the flyout opens and closes three times; that is the script, not a fault.
 */
export const AuthoringWalkthrough: Story = {
  render: () => <FormulaAuthoring />,
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    const row = () => canvasElement.querySelector<HTMLElement>('[data-row="Opacity"]');
    const trigger = row()?.querySelector<HTMLButtonElement>('[aria-label="Property options"]');
    if (!trigger) throw new Error("A literal row offers the menu from a chevron");
    trigger.click();
    const write = await waitFor(
      () =>
        Array.from(doc.querySelectorAll<HTMLElement>('[role="option"]')).find(
          (option) => option.textContent?.trim() === "Write a Formula",
        ),
      "Write a Formula in the menu",
    );
    write.click();

    const editor = await typeIntoEditor(doc, "Candidates * 10");
    // The draft is React state; Enter applies the draft the flyout has rendered.
    await waitFor(
      () => doc.querySelector(OPEN_FLYOUT)?.textContent?.includes("=50"),
      "the = line to read 50",
    );
    press(editor, "Enter");
    const applied = await waitFor(
      () => row()?.querySelector<HTMLInputElement>('[data-slot="combobox-input"][readonly]'),
      "the Formula to apply on Enter",
    );
    if (applied.value !== "50") throw new Error(`Enter applied ${applied.value}, not 50`);
    await waitFor(() => !doc.querySelector(OPEN_FLYOUT), "Enter to close the flyout");

    row()?.querySelector<HTMLButtonElement>('[aria-label="Edit Formula"]')?.click();
    const reopened = await typeIntoEditor(doc, "Candidates * 99");
    await waitFor(
      () => doc.querySelector(OPEN_FLYOUT)?.textContent?.includes("=495"),
      "the = line to read 495",
    );
    press(reopened, "Escape");
    await waitFor(() => !doc.querySelector(OPEN_FLYOUT), "Esc to close the flyout");
    const kept = row()?.querySelector<HTMLInputElement>('[data-slot="combobox-input"]');
    if (kept?.value !== "50") throw new Error("Esc must discard the draft");
    // A real press lets React render between pointerdown and click; without that pause a stale
    // host would still see the flyout open on click and mask a reopen.
    const between = () => new Promise<void>((resolve) => setTimeout(resolve, 50));

    // Pressing the Formula button of an open flyout applies and closes it — it must not apply on
    // pointerdown and then reopen on the click that follows. A real press, in its real order.
    const formulaButton = () =>
      row()?.querySelector<HTMLButtonElement>('[aria-label="Edit Formula"]') ?? null;
    formulaButton()?.click();
    await typeIntoEditor(doc, "Candidates * 2");
    await waitFor(
      () => doc.querySelector(OPEN_FLYOUT)?.textContent?.includes("=10"),
      "the = line to read 10",
    );
    const toggle = formulaButton();
    if (!toggle) throw new Error("The Formula button is missing");
    toggle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    toggle.focus();
    await between();
    toggle.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
    // The row may have re-rendered; click the button as it is now.
    (formulaButton() ?? toggle).click();
    await waitFor(
      () => row()?.querySelector<HTMLInputElement>('[data-slot="combobox-input"]')?.value === "10",
      "the button to apply the draft",
    );
    // Long enough for a reopen on the trailing click to have shown itself; the check is a snapshot,
    // not a wait, because a reopened flyout can close again later on its own.
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    if (doc.querySelector(OPEN_FLYOUT)) throw new Error("The button reopened the flyout");
  },
};
