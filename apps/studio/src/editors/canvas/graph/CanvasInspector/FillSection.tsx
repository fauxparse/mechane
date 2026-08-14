import type { GradientFill, GradientStop } from "@mechane/domain";
import {
  BanIcon,
  Button,
  DropletIcon,
  GradientLinearIcon,
  GradientRadialIcon,
  PaintBucketIcon,
  PlusIcon,
  PropertyInput,
  Slider,
  ToggleGroup,
  ToggleGroupItem,
  Trash2Icon,
  cn,
} from "@mechane/design-system";
import { useState } from "react";

import { PropertyField } from "./CanvasInspectorFields";
import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import { isVariableInput } from "./canvas-inspector-values";
import { Section, SectionRow } from "./Section";

const DEFAULT_GRADIENT: GradientFill = {
  kind: "linear",
  angle: 0,
  stops: [
    { color: "#000000", position: 0 },
    { color: "#ffffff", position: 1 },
  ],
};

const isGradientFill = (value: unknown): value is GradientFill =>
  value !== null && typeof value === "object" && "stops" in value && Array.isArray(value.stops);

const gradientKind = (fill: GradientFill): "linear" | "radial" =>
  fill.kind ?? fill.type ?? "linear";

export const gradientForMode = (
  mode: "linear" | "radial",
  existing?: GradientFill | null,
): GradientFill => (existing ? { ...existing, kind: mode } : { ...DEFAULT_GRADIENT, kind: mode });

const parseHexChannels = (color: string | undefined): [number, number, number] | null => {
  const hex = color?.trim().replace(/^#/, "");
  if (!hex || !/^[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(hex)) return null;
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
};

const blendHexColors = (left?: string, right?: string) => {
  const start = parseHexChannels(left);
  const end = parseHexChannels(right);
  if (!start || !end) return left ?? right ?? "#808080";
  const channel = (leftChannel: number, rightChannel: number) =>
    Math.round((leftChannel + rightChannel) / 2)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(start[0], end[0])}${channel(start[1], end[1])}${channel(start[2], end[2])}`;
};

export const insertedGradientStop = (stops: readonly GradientStop[]): GradientStop => {
  const ordered = [...stops].sort((left, right) => left.position - right.position);
  const previous = ordered.at(-2);
  const last = ordered.at(-1);
  if (!previous || !last) return { color: "#808080", position: 0.5 };
  return {
    color: blendHexColors(previous.color, last.color),
    position: (previous.position + last.position) / 2,
  };
};

type FillMode = "none" | "solid" | "linear" | "radial";

const gradientCss = (fill: GradientFill) => {
  const stops = fill.stops
    .map(
      (stop) => `${stop.color ?? "transparent"} ${Math.max(0, Math.min(1, stop.position)) * 100}%`,
    )
    .join(", ");
  return `linear-gradient(to right, ${stops})`;
};

const GradientEditor = ({
  fill,
  update,
}: {
  fill: GradientFill;
  update: (properties: Record<string, unknown>) => void;
}) => {
  const [activeStopIndex, setActiveStopIndex] = useState(0);
  const selectedStopIndex = Math.min(activeStopIndex, Math.max(0, fill.stops.length - 1));
  const selectedStop = fill.stops[selectedStopIndex];
  const updateGradient = (changes: Partial<GradientFill>) => {
    update({ fill: { ...fill, ...changes } });
  };
  const updateStop = (index: number, changes: Partial<GradientFill["stops"][number]>) => {
    updateGradient({
      stops: fill.stops.map((stop, stopIndex) =>
        stopIndex === index ? { ...stop, ...changes } : stop,
      ),
    });
  };
  const addStop = () => {
    const newStop = insertedGradientStop(fill.stops);
    const stops = [...fill.stops, newStop].sort((left, right) => left.position - right.position);
    setActiveStopIndex(stops.indexOf(newStop));
    updateGradient({ stops });
  };

  return (
    <div className="col-span-full grid grid-cols-subgrid gap-2 items-center">
      <Slider.Root
        className="col-span-2"
        value={fill.stops.map((stop) => Math.round(stop.position * 100))}
        min={0}
        max={100}
        step={1}
        onValueChange={(nextValues) => {
          const values = Array.isArray(nextValues) ? nextValues : [nextValues];
          updateGradient({
            stops: fill.stops.map((stop, index) => ({
              ...stop,
              position: (values[index] ?? stop.position * 100) / 100,
            })),
          });
        }}
      >
        <Slider.Control className="py-3">
          <Slider.Track
            className="h-3 border border-border bg-muted"
            style={{ backgroundImage: gradientCss(fill) }}
          >
            {fill.stops.map((stop, index) => (
              <Slider.Thumb
                index={index}
                key={`${stop.position}-${index}`}
                className={cn(
                  "size-4 cursor-pointer border-px border-input shadow-[0_0_0_1px_rgb(0_0_0/0.65)]",
                  selectedStopIndex === index &&
                    "scale-125 ring-2 ring-primary ring-offset-background",
                )}
                style={{
                  backgroundColor: stop.color ?? "#000000",
                  zIndex: selectedStopIndex === index ? 1 : 0,
                }}
                onFocus={() => setActiveStopIndex(index)}
                onPointerDown={() => setActiveStopIndex(index)}
              />
            ))}
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
      <Button variant="ghost" size="icon-sm" onClick={addStop}>
        <PlusIcon />
      </Button>
      {selectedStop && (
        <SectionRow>
          <div className="grid grid-cols-[1fr_4rem] col-span-2 gap-2">
            <PropertyInput
              type="color"
              icon={DropletIcon}
              value={{ kind: "color", value: selectedStop.color ?? "#000000" }}
              placeholder={`Stop ${selectedStopIndex + 1} color`}
              onChange={(next) => {
                if (!next || isVariableInput(next) || next.kind !== "color") return;
                if (typeof next.value !== "string") return;
                updateStop(selectedStopIndex, { color: next.value });
              }}
            />
            <PropertyInput
              type="number"
              value={{ kind: "number", value: Math.round(selectedStop.position * 100) }}
              min={0}
              max={100}
              unit="%"
              allowLink={false}
              placeholder={`Stop ${selectedStopIndex + 1} position`}
              onChange={(next) => {
                if (!next || isVariableInput(next) || next.kind !== "number") return;
                updateStop(selectedStopIndex, { position: next.value / 100 });
              }}
            />
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={fill.stops.length <= 2}
            aria-label={`Delete stop ${selectedStopIndex + 1}`}
            title={fill.stops.length <= 2 ? "A gradient needs at least two stops" : undefined}
            onClick={() => {
              const stops = fill.stops.filter((_, index) => index !== selectedStopIndex);
              setActiveStopIndex(Math.min(selectedStopIndex, stops.length - 1));
              updateGradient({ stops });
            }}
          >
            <Trash2Icon />
          </Button>
        </SectionRow>
      )}
    </div>
  );
};

export const FillSection = () => {
  const { selected, common, update } = useCanvasInspectorContext();
  const fill = common("fill");
  const allUnfilled = selected.every((element) => Reflect.get(element, "fill") === undefined);
  const hasMixedFill =
    selected.length > 1 &&
    !allUnfilled &&
    fill === undefined &&
    selected.some((element) => Reflect.get(element, "fill") !== undefined);
  const gradient = isGradientFill(fill) ? fill : null;
  const fillMode: FillMode | null = hasMixedFill
    ? null
    : allUnfilled
      ? "none"
      : gradient
        ? gradientKind(gradient)
        : "solid";

  return (
    <Section label="Fill">
      <ToggleGroup
        className="col-span-2 w-full rounded-sm *:grow"
        spacing={0.5}
        value={fillMode ? [fillMode] : []}
        onValueChange={([nextMode]) => {
          switch (nextMode as FillMode) {
            case "none":
              update({ fill: undefined });
              break;
            case "solid":
              update({ fill: "#000000" });
              break;
            case "linear":
              update({ fill: gradientForMode("linear", gradient) });
              break;
            case "radial":
              update({ fill: gradientForMode("radial", gradient) });
              break;
          }
        }}
      >
        <ToggleGroupItem value="none" size="sm">
          <BanIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value="solid" size="sm" aria-label="Solid fill">
          <PaintBucketIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value="linear" size="sm" aria-label="Linear gradient">
          <GradientLinearIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value="radial" size="sm" aria-label="Radial gradient">
          <GradientRadialIcon />
        </ToggleGroupItem>
      </ToggleGroup>
      {hasMixedFill ? (
        <span className="col-span-full text-xs text-muted-foreground">Mixed</span>
      ) : gradient ? (
        <SectionRow>
          <GradientEditor fill={gradient} update={update} />
        </SectionRow>
      ) : fillMode === "solid" ? (
        <SectionRow>
          <PropertyField name="fill" icon={PaintBucketIcon} className="col-span-full" />
        </SectionRow>
      ) : null}
    </Section>
  );
};
