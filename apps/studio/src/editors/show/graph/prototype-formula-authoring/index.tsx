// PROTOTYPE (issue #675) — the prototype's whole surface to the real editor.
//
// Five wire points, each marked `PROTOTYPE #675` where it lands:
//   - nodes/TransformerNode.tsx swaps the node body
//   - inspector/SingleNode.tsx swaps the Transformer inspector section
//   - graph-to-flow.ts widens a Transformer to the variant's width
//   - routes/.../-show-graph-route.tsx mounts the switcher bar and the overlay
import { VariantANodeBody, VariantAInspector } from "./VariantA";
import { VariantBInspector, VariantBNodeBody, VariantBWorkbench } from "./VariantB";
import { VariantCInspector, VariantCNodeBody } from "./VariantC";
import { activeVariant, type PrototypeVariant } from "./prototype-variant";
import type { PrototypeVariantComponents } from "./variant-parts";

export const PROTOTYPE_VARIANT_COMPONENTS: Record<PrototypeVariant, PrototypeVariantComponents> = {
  A: { NodeBody: VariantANodeBody, Inspector: VariantAInspector, headerOutputHandle: true },
  B: { NodeBody: VariantBNodeBody, Inspector: VariantBInspector, headerOutputHandle: true },
  C: { NodeBody: VariantCNodeBody, Inspector: VariantCInspector, headerOutputHandle: true },
};

/** Variant B's workbench is the only variant that renders outside the graph. */
export function PrototypeOverlay() {
  return activeVariant() === "B" ? <VariantBWorkbench /> : null;
}

export { PrototypeVariantBar } from "./PrototypeVariantBar";
export {
  activeVariant,
  prototypeNodeWidth,
  usePrototypeTransform,
  PROTOTYPE_VARIANTS,
  VARIANT_NAMES,
  type PrototypeVariant,
} from "./prototype-variant";
export { prototypeEdgePortHandle } from "./formula-state";
