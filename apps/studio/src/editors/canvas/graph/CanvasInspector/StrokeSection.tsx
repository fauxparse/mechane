import type { Element as CanvasElement, Stroke, StrokeStyle } from "@mechane/domain";
import {
  Button,
  PenLineIcon,
  PenToolIcon,
  PlusIcon,
  PropertyInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Trash2Icon,
} from "@mechane/design-system";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import { isVariableInput } from "./canvas-inspector-values";
import { Section, SectionRow } from "./Section";

const DEFAULT_STROKE: Stroke = {
  width: 1,
  style: "solid",
  color: "#000000",
};

const STROKE_STYLES = [
  { label: "Solid", value: "solid" },
  { label: "Dotted", value: "dotted" },
  { label: "Dashed", value: "dashed" },
] as const;

const isStroke = (value: unknown): value is Stroke => {
  if (!value || typeof value !== "object") return false;
  const stroke = value as Record<string, unknown>;
  return (
    typeof stroke.width === "number" &&
    (stroke.style === "solid" || stroke.style === "dotted" || stroke.style === "dashed") &&
    typeof stroke.color === "string"
  );
};
const commonStrokeField = <K extends keyof Stroke>(
  elements: readonly CanvasElement[],
  field: K,
): Stroke[K] | undefined => {
  const values = elements.map((element) => {
    const value = Reflect.get(element, "stroke");
    return isStroke(value) ? value[field] : undefined;
  });
  const first = values[0];
  return values.every((value) => value === first) ? first : undefined;
};

export const StrokeSection = () => {
  const { selected, update } = useCanvasInspectorContext();
  const anyStrokes = selected.some((shape) => Reflect.get(shape, "stroke") !== undefined);
  const width = commonStrokeField(selected, "width");
  const style = commonStrokeField(selected, "style");
  const color = commonStrokeField(selected, "color");
  const stroke: Stroke = {
    width: width ?? DEFAULT_STROKE.width,
    style: style ?? DEFAULT_STROKE.style,
    color: color ?? DEFAULT_STROKE.color,
  };
  const updateStroke = (changes: Partial<Stroke>) => update({ stroke: { ...stroke, ...changes } });
  const removeStroke = () => update({ stroke: undefined });

  return (
    <Section label="Stroke">
      {anyStrokes ? (
        <>
          <SectionRow>
            <PropertyInput
              type="number"
              icon={PenLineIcon}
              value={width === undefined ? undefined : { kind: "number", value: width }}
              min={0}
              unit="px"
              placeholder={width === undefined ? "Mixed" : "Stroke width"}
              onChange={(next) => {
                if (!next || isVariableInput(next) || next.kind !== "number") return;
                updateStroke({ width: next.value });
              }}
            />
            <Select
              items={STROKE_STYLES}
              value={style ?? null}
              onValueChange={(value) => {
                updateStroke({ style: value as StrokeStyle });
              }}
            >
              <SelectTrigger
                className="w-full rounded-sm border-0 bg-muted/50 dark:bg-muted/50 px-2"
                size="sm"
              >
                <SelectValue placeholder={style === undefined ? "Mixed" : undefined} />
              </SelectTrigger>
              <SelectContent>
                {STROKE_STYLES.map((style) => (
                  <SelectItem key={style.value} value={style.value}>
                    {style.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Remove stroke"
              onClick={removeStroke}
            >
              <Trash2Icon />
            </Button>
          </SectionRow>
          <SectionRow>
            <PropertyInput
              type="color"
              icon={PenToolIcon}
              className="col-span-2"
              value={color === undefined ? undefined : { kind: "color", value: color }}
              placeholder={color === undefined ? "Mixed" : "Stroke color"}
              onChange={(next) => {
                if (!next || isVariableInput(next) || next.kind !== "color") return;
                if (typeof next.value === "string") updateStroke({ color: next.value });
              }}
            />
          </SectionRow>
        </>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="col-span-2 rounded-sm"
          aria-label="Add stroke"
          onClick={() => updateStroke({ width: 1, style: "solid", color: "#000000" })}
        >
          <PlusIcon />
          Add stroke
        </Button>
      )}
    </Section>
  );
};
