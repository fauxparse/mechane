import { PropertyInput } from "@mechane/design-system";

import { Section, SectionRow } from "./Section";
import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import { isVariableInput } from "./canvas-inspector-values";

export const PositionSection = () => {
  const { target, absolute, inspectorPreview, update } = useCanvasInspectorContext();
  if (!absolute || !target.anchor) return null;

  return (
    <Section label="Position">
      <SectionRow>
        <PropertyInput
          icon="X"
          type="number"
          value={{
            kind: "number",
            value:
              inspectorPreview?.elementId === target.id && inspectorPreview.x !== undefined
                ? inspectorPreview.x
                : (target.anchor.offsetX ?? 0),
          }}
          onChange={(next) => {
            if (!isVariableInput(next) && next?.kind === "number") {
              update({ anchor: { ...target.anchor, offsetX: next.value } });
            }
          }}
        />
        <PropertyInput
          icon="Y"
          type="number"
          value={{
            kind: "number",
            value:
              inspectorPreview?.elementId === target.id && inspectorPreview.y !== undefined
                ? inspectorPreview.y
                : (target.anchor.offsetY ?? 0),
          }}
          onChange={(next) => {
            if (!isVariableInput(next) && next?.kind === "number") {
              update({ anchor: { ...target.anchor, offsetY: next.value } });
            }
          }}
        />
      </SectionRow>
    </Section>
  );
};
