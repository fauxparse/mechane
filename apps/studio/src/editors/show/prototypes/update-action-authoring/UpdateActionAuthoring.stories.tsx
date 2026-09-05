/**
 * PROTOTYPE — throwaway. Not production code.
 *
 * Three variants of Update Action authoring, switchable from the floating bar
 * (or the ← / → arrow keys). They disagree about *which editor owns the route*
 * from an Element tap inside a Block to a Source Field:
 *
 *   A — Owned in place    each link edited where it lives, breadcrumb for context
 *   B — One document      the whole route as one panel, in both editors
 *   C — Graph gesture     the projected Update edge is the object, as Navigate is
 *
 * Answers: https://github.com/fauxparse/mechane/issues/537
 */
import { InspectorProvider } from "@mechane/design-system";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { INITIAL_STATE, type PrototypeState } from "./data";
import { PrototypeSwitcher, type VariantMeta } from "./PrototypeSwitcher";
import { VariantA } from "./VariantA";
import { VariantB } from "./VariantB";
import { VariantC } from "./VariantC";

const VARIANTS: VariantMeta[] = [
  { key: "A", name: "Owned in place" },
  { key: "B", name: "One document" },
  { key: "C", name: "Graph gesture" },
];

function Prototype() {
  const [variant, setVariant] = useState("A");
  const [state, setState] = useState<PrototypeState>(INITIAL_STATE);
  const set = (patch: Partial<PrototypeState>) =>
    setState((current) => ({ ...current, ...patch }));

  return (
    <InspectorProvider>
      {variant === "A" ? <VariantA state={state} set={set} /> : null}
      {variant === "B" ? <VariantB state={state} set={set} /> : null}
      {variant === "C" ? <VariantC state={state} set={set} /> : null}
      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={setVariant} />
      <button
        type="button"
        onClick={() => set({ runActive: !state.runActive })}
        className="fixed right-4 bottom-6 z-50 rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-sm"
      >
        Run: {state.runActive ? "active" : "stopped"}
      </button>
    </InspectorProvider>
  );
}

const meta = {
  title: "studio/prototypes/Update Action authoring",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: () => <Prototype />,
};
