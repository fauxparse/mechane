// PROTOTYPE (issue #676) — the prototype's whole surface to the real editor.
//
// Four wire points, each marked `PROTOTYPE #676` where it lands:
//   - nodes/TransformerNode.tsx swaps the node body
//   - inspector/SingleNode.tsx swaps the Transformer inspector section
//   - graph-to-flow.ts widens a Transformer to the variant's width
//   - routes/.../-show-graph-route.tsx mounts the switcher bar
import { VariantANodeBody, VariantAInspector } from "./VariantA";
import { VariantBNodeBody, VariantBInspector } from "./VariantB";
import { VariantCNodeBody, VariantCInspector } from "./VariantC";
import type { PrototypeVariant } from "./prototype-variant";
import type { PrototypeVariantComponents } from "./variant-parts";

export const PROTOTYPE_VARIANT_COMPONENTS: Record<PrototypeVariant, PrototypeVariantComponents> = {
  A: { NodeBody: VariantANodeBody, Inspector: VariantAInspector, headerOutputHandle: true },
  B: { NodeBody: VariantBNodeBody, Inspector: VariantBInspector, headerOutputHandle: false },
  C: { NodeBody: VariantCNodeBody, Inspector: VariantCInspector, headerOutputHandle: false },
};

export { PrototypeVariantBar } from "./PrototypeVariantBar";
export {
  activeVariant,
  prototypeNodeWidth,
  usePrototypeTransform,
  PROTOTYPE_VARIANTS,
  VARIANT_NAMES,
  type PrototypeVariant,
} from "./prototype-variant";
export { prototypeEdgePortHandle } from "./transform-prototype-state";
