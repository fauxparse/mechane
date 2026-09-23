// PROTOTYPE (issue #712) — the prototype's whole surface to the real inspector.
//
// Three wire points, each marked `PROTOTYPE #712` where it lands:
//   - SizeFieldInput.tsx        the W/H rows
//   - SizeConstraintField.tsx   the min/max rows
//   - CanvasWorkspaceEditor.tsx the floating variant bar and the measured sizes
//
// With no `?variant=` in the URL every one of them renders exactly what it
// renders on main.
import { useState } from "react";

import { activeVariant } from "./prototype-variant";
import { usePercentageField, type PercentageSlot } from "./use-percentage-field";
import { variantAOverrides } from "./VariantA";
import { variantBOverrides, VariantBConstraintTrigger } from "./VariantB";
import { variantCOverrides } from "./VariantC";
import { NO_OVERRIDES, type PercentOverrides } from "./variant-contract";

export function usePercentageOverrides(slot: PercentageSlot): PercentOverrides {
  const variant = activeVariant();
  const field = usePercentageField(slot);
  const [rejection, setRejection] = useState<string | null>(null);

  if (!variant) return NO_OVERRIDES;
  if (variant === "A") return variantAOverrides(field, rejection, setRejection);
  if (variant === "B") {
    const overrides = variantBOverrides(field);
    // A min/max row has no connector, so the menu has no visible trigger of its own.
    return slot.constraint ? { ...overrides, actions: <VariantBConstraintTrigger /> } : overrides;
  }
  return variantCOverrides(field);
}

export {
  activeVariant,
  PROTOTYPE_VARIANTS,
  VARIANT_NAMES,
  type PrototypeVariant,
} from "./prototype-variant";
export { PrototypeVariantBar } from "./PrototypeVariantBar";
export type { PercentageSlot } from "./use-percentage-field";
export type { PercentOverrides } from "./variant-contract";
