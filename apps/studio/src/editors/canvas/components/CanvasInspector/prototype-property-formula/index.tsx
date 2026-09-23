// PROTOTYPE (issue #711) — the prototype's whole surface to the real inspector.
//
// Four wire points, each marked `PROTOTYPE #711` where it lands:
//   - CanvasInspectorFields.tsx   every `PropertyField` row
//   - SizeFieldInput.tsx          the W/H row, which is its own special case
//   - CanvasInspector.tsx         Variant C's pinned Formula section
//   - CanvasWorkspaceEditor.tsx   the floating variant bar
//
// With no `?variant=` in the URL every one of them renders exactly what it
// renders on main.
import { cn } from "@mechane/design-system";
import { useRef, type ReactNode } from "react";

import type { PrototypeVariant } from "./prototype-variant";
import { usePropertyFormula, type FormulaSlot } from "./use-property-formula";
import { VariantA, variantAOverrides } from "./VariantA";
import { VariantBFlyout, variantBOverrides } from "./VariantB";
import { variantCOverrides } from "./VariantC";
import type { FormulaInputOverrides } from "./variant-contract";

export function PrototypeFormulaProperty({
  variant,
  slot,
  className,
  children,
}: {
  variant: PrototypeVariant;
  slot: FormulaSlot;
  className?: string;
  children: (overrides: FormulaInputOverrides) => ReactNode;
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const formula = usePropertyFormula(slot);

  let overrides: FormulaInputOverrides;
  if (variant === "A") {
    overrides = formula.active
      ? {
          replaced: <VariantA formula={formula} slot={slot} />,
          wrapperClassName: formula.open ? "col-span-full" : undefined,
        }
      : variantAOverrides(formula);
  } else if (variant === "B") {
    overrides = variantBOverrides(formula, anchorRef);
  } else {
    overrides = variantCOverrides(formula, slot);
  }

  return (
    <div ref={anchorRef} className={cn("min-w-0", className, overrides.wrapperClassName)}>
      {overrides.replaced ?? children(overrides)}
      {variant === "B" ? (
        <VariantBFlyout formula={formula} slot={slot} anchorRef={anchorRef} />
      ) : null}
    </div>
  );
}

export {
  activeVariant,
  PROTOTYPE_VARIANTS,
  VARIANT_NAMES,
  type PrototypeVariant,
} from "./prototype-variant";
export { PrototypeVariantBar } from "./PrototypeVariantBar";
export { VariantCFormulaSection } from "./VariantC";
export type { FormulaSlot } from "./use-property-formula";
export type { FormulaInputOverrides } from "./variant-contract";
