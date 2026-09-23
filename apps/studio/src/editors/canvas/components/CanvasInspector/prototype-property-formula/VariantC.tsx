// PROTOTYPE (issue #711) — Variant C: one Formula section, the #675 shape.
//
// The argument: Property rows are for values, and a Formula is not a value. So
// no row ever hosts an editor. Entering Formula mode is a menu item beside
// "Connect variable" — the menu already owns the other mode switch — and the
// editor lives in one pinned `Formula` section at the foot of the inspector,
// which names the Property it is editing and lists every other computed
// Property in the selection as a chip.
//
// At rest a Formula row shows its *source*, truncated: a glance down the
// inspector then tells you which Properties are computed. The result is on the
// Artboard, and on the section's `=` line.
import {
  Button,
  ComboboxGroup,
  ComboboxItem,
  ComboboxSeparator,
  Section,
  SectionRow,
  Trash2Icon,
  cn,
} from "@mechane/design-system";
import { elementPropertyDescriptor, type ElementPropertyName } from "@mechane/domain";

import { FormulaEditor } from "../../../../show/graph/formula/FormulaEditor";
import { useCanvasInspectorContext } from "../CanvasInspectorContext";
import { FORMULA_PROPERTIES } from "./formula-properties";
import {
  clearFormula,
  formulaKey,
  formulasFor,
  openFormula,
  setFormula,
  useFormulaStore,
} from "./formula-state";
import { activeVariant } from "./prototype-variant";
import { analyseProperty, expectedTypeFor, propertyFormulaScope } from "./property-scope";
import {
  BlockedMark,
  DiagnosticsList,
  FormulaGlyph,
  MixedFormulas,
  ReadingNow,
  ResultLine,
} from "./variant-parts";
import type { FormulaSlot, PropertyFormula } from "./use-property-formula";
import type { FormulaInputOverrides } from "./variant-contract";

export const WRITE_A_FORMULA = "prototype-711-write-a-formula";

export function variantCOverrides(
  formula: PropertyFormula,
  slot: FormulaSlot,
): FormulaInputOverrides {
  return {
    menuItems: (
      <>
        <ComboboxGroup>
          <ComboboxItem value={WRITE_A_FORMULA}>
            <FormulaGlyph className="w-4 text-center" />
            Write a Formula
          </ComboboxItem>
        </ComboboxGroup>
        <ComboboxSeparator />
      </>
    ),
    onMenuSelect(value) {
      if (value !== WRITE_A_FORMULA) return false;
      formula.begin(formula.source ?? "");
      return true;
    },
    replaced: formula.active ? (
      <button
        type="button"
        aria-label={`${slot.label} Formula: ${formula.source ?? "several"}`}
        className={cn(
          "flex h-7 w-full min-w-0 items-center gap-1 rounded-sm bg-muted/50 px-1.5 text-left",
          formula.open && "ring-1 ring-accent",
          formula.blocked && "ring-1 ring-destructive",
        )}
        onClick={() => openFormula(formula.keys[0] ?? null)}
      >
        <span className="font-mono text-xs text-muted-foreground">=</span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-mono text-xs",
            formula.blocked && "text-destructive",
          )}
        >
          {formula.sources.length > 1
            ? `${formula.sources.length} Formulas`
            : (formula.source ?? "")}
        </span>
        {formula.blocked ? <BlockedMark message="This Formula can't be evaluated" /> : null}
      </button>
    ) : undefined,
  };
}

/** The pinned editor. Mounted once, at the foot of the inspector. */
export function VariantCFormulaSection() {
  const { selected, variables, shapes } = useCanvasInspectorContext();
  const { sources, open } = useFormulaStore();
  if (activeVariant() !== "C") return null;

  const elementIds = selected.map((element) => element.id);
  const present = formulasFor(sources, elementIds);
  // A Property whose row is not shown for this selection has no section either:
  // otherwise the section outlives the control it belongs to.
  const properties = [...new Set(present.map((entry) => entry.property))].filter(
    (candidate) =>
      candidate.startsWith("sizing.") ||
      selected.every((element) =>
        elementPropertyDescriptor(candidate as ElementPropertyName, element),
      ),
  );
  if (properties.length === 0) return null;

  const openProperty = open ? (open.slice(open.indexOf("::") + 2) ?? null) : null;
  const property =
    openProperty && properties.includes(openProperty) ? openProperty : (properties[0] ?? "");
  const descriptor = FORMULA_PROPERTIES[property];
  if (!descriptor) return null;

  const keys = elementIds.map((id) => formulaKey(id, property));
  const distinct = [
    ...new Set(present.filter((entry) => entry.property === property).map((entry) => entry.source)),
  ];
  const source = distinct.length === 1 ? (distinct[0] ?? "") : "";
  const { scope, entries } = propertyFormulaScope(
    variables,
    shapes,
    expectedTypeFor(descriptor.type),
  );
  const analysis = analyseProperty(source, scope);

  return (
    <Section
      label={
        <span className="flex items-center gap-1.5">
          <FormulaGlyph />
          Formula · {descriptor.label}
        </span>
      }
      buttons={
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Remove the ${descriptor.label} Formula`}
          onClick={() => clearFormula(keys)}
        >
          <Trash2Icon />
        </Button>
      }
    >
      {properties.length > 1 ? (
        <SectionRow className="grid-cols-[1fr]">
          <div className="flex flex-wrap gap-1">
            {properties.map((candidate) => (
              <button
                key={candidate}
                type="button"
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs",
                  candidate === property
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted text-muted-foreground",
                )}
                onClick={() => openFormula(formulaKey(elementIds[0] ?? "", candidate))}
              >
                {FORMULA_PROPERTIES[candidate]?.label ?? candidate}
              </button>
            ))}
          </div>
        </SectionRow>
      ) : null}
      {distinct.length > 1 ? (
        <SectionRow className="grid-cols-[1fr]">
          <MixedFormulas
            sources={distinct}
            onReplaceAll={() => setFormula(keys, distinct[0] ?? "")}
          />
        </SectionRow>
      ) : (
        <>
          <SectionRow className="grid-cols-[1fr]">
            <FormulaEditor
              value={source}
              scope={scope}
              onChange={(next) => setFormula(keys, next)}
              placeholder="opacity * 100"
            />
          </SectionRow>
          <SectionRow className="grid-cols-[1fr]">
            <ResultLine analysis={analysis} />
          </SectionRow>
        </>
      )}
      {analysis?.diagnostics.length ? (
        <SectionRow className="grid-cols-[1fr]">
          <DiagnosticsList analysis={analysis} />
        </SectionRow>
      ) : null}
      <SectionRow className="grid-cols-[1fr]">
        <ReadingNow entries={entries} />
      </SectionRow>
    </Section>
  );
}
