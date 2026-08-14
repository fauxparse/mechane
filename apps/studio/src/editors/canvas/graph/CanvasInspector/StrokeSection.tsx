import type { Stroke } from "@mechane/domain";
import { DropletIcon, PropertyInput, ToggleGroup, ToggleGroupItem } from "@mechane/design-system";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import { isVariableInput } from "./canvas-inspector-values";
import { Section, SectionRow } from "./Section";

const DEFAULT_STROKE: Stroke = {
  width: 1,
  style: "solid",
  color: "#000000",
};

const isStroke = (value: unknown): value is Stroke => {
  if (!value || typeof value !== "object") return false;
  const stroke = value as Record<string, unknown>;
  return (
    typeof stroke.width === "number" &&
    (stroke.style === "solid" || stroke.style === "dotted" || stroke.style === "dashed") &&
    typeof stroke.color === "string"
  );
};

export const StrokeSection = () => {
  const { common, update } = useCanvasInspectorContext();
  const rawStroke = common("stroke");
  const stroke = isStroke(rawStroke) ? rawStroke : DEFAULT_STROKE;
  const updateStroke = (changes: Partial<Stroke>) => update({ stroke: { ...stroke, ...changes } });

  return (
    <Section label="Stroke">
      <SectionRow>
        <PropertyInput
          type="number"
          icon="W"
          value={{ kind: "number", value: stroke.width }}
          min={0}
          unit="px"
          placeholder="Stroke width"
          onChange={(next) => {
            if (!next || isVariableInput(next) || next.kind !== "number") return;
            updateStroke({ width: next.value });
          }}
        />
        <ToggleGroup
          className="col-span-2 w-full rounded-sm *:grow"
          spacing={0.5}
          value={[stroke.style]}
          onValueChange={([style]) => {
            if (style === "solid" || style === "dotted" || style === "dashed") {
              updateStroke({ style });
            }
          }}
        >
          <ToggleGroupItem value="solid" size="sm" aria-label="Solid line">
            Solid
          </ToggleGroupItem>
          <ToggleGroupItem value="dotted" size="sm" aria-label="Dotted line">
            Dotted
          </ToggleGroupItem>
          <ToggleGroupItem value="dashed" size="sm" aria-label="Dashed line">
            Dashed
          </ToggleGroupItem>
        </ToggleGroup>
      </SectionRow>
      <SectionRow>
        <PropertyInput
          type="color"
          icon={DropletIcon}
          className="col-span-full"
          value={{ kind: "color", value: stroke.color }}
          placeholder="Stroke color"
          onChange={(next) => {
            if (!next || isVariableInput(next) || next.kind !== "color") return;
            if (typeof next.value === "string") updateStroke({ color: next.value });
          }}
        />
      </SectionRow>
    </Section>
  );
};
