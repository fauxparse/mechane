import type { Stroke, StrokeStyle } from "@mechane/domain";
import {
  Button,
  PenIcon,
  PenLineIcon,
  PenToolIcon,
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
const sameStroke = (left: unknown, right: unknown): boolean => {
  if (!isStroke(left) || !isStroke(right)) return false;
  return left.width === right.width && left.style === right.style && left.color === right.color;
};

export const StrokeSection = () => {
  const { common, selected, update } = useCanvasInspectorContext();
  const strokeValues = selected.map((shape) => Reflect.get(shape, "stroke"));
  const anyStrokes = strokeValues.some((value) => value !== undefined);
  const uniformStroke =
    strokeValues.length > 0 &&
    strokeValues.every((value) => sameStroke(value, strokeValues[0]));
  const hasMixedStroke = selected.length > 1 && anyStrokes && !uniformStroke;
  const rawStroke = uniformStroke ? strokeValues[0] : common("stroke");
  const stroke = isStroke(rawStroke) ? rawStroke : DEFAULT_STROKE;
  const updateStroke = (changes: Partial<Stroke>) => update({ stroke: { ...stroke, ...changes } });

  return (
    <Section label="Stroke">
      {hasMixedStroke ? (
        <span className="col-span-full text-xs text-muted-foreground">Mixed</span>
      ) : anyStrokes ? (
        <>
          <SectionRow>
            <PropertyInput
              type="number"
              icon={PenLineIcon}
              value={{ kind: "number", value: stroke.width }}
              min={0}
              unit="px"
              placeholder="Stroke width"
              onChange={(next) => {
                if (!next || isVariableInput(next) || next.kind !== "number") return;
                updateStroke({ width: next.value });
              }}
            />
            <Select
              items={STROKE_STYLES}
              value={stroke.style}
              onValueChange={(value) => {
                updateStroke({ style: value as StrokeStyle });
              }}
            >
              <SelectTrigger
                className="w-full rounded-sm border-0 bg-muted/50 dark:bg-muted/50 px-2"
                size="sm"
              >
                <SelectValue />
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
              onClick={() => updateStroke({ width: 0 })}
            >
              <Trash2Icon />
            </Button>
          </SectionRow>
          <SectionRow>
            <PropertyInput
              type="color"
              icon={PenToolIcon}
              className="col-span-2"
              value={{ kind: "color", value: stroke.color }}
              placeholder="Stroke color"
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
          <PenIcon />
          Add stroke
        </Button>
      )}
    </Section>
  );
};
