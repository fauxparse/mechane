import { PropertyInput, Section, SectionRow } from "@mechane/design-system";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import { isVariableInput } from "./canvas-inspector-values";

export const PositionSection = () => {
  const { selected, absolute, inspectorPreview, update } = useCanvasInspectorContext();
  const allAnchored =
    selected.length > 0 && selected.every((element) => element.anchor !== undefined);
  if (!absolute || !allAnchored) return null;

  const commonOffset = (axis: "offsetX" | "offsetY") => {
    const values = selected.map((element) => element.anchor?.[axis] ?? 0);
    const first = values[0];
    return values.every((value) => value === first) ? first : undefined;
  };
  const offsetX = commonOffset("offsetX");
  const offsetY = commonOffset("offsetY");
  const target = selected[0]!;
  const previewValue =
    selected.length === 1 && inspectorPreview?.elementId === target.id ? inspectorPreview : null;

  return (
    <Section label="Position">
      <SectionRow>
        <PropertyInput
          icon="X"
          type="number"
          value={{
            kind: "number",
            value: previewValue?.x ?? offsetX ?? 0,
          }}
          placeholder={offsetX === undefined ? "Mixed" : undefined}
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
            value: previewValue?.y ?? offsetY ?? 0,
          }}
          placeholder={offsetY === undefined ? "Mixed" : undefined}
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
