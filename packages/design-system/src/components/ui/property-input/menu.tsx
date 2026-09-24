import {
  CheckIcon,
  ChevronsDownUpIcon,
  ChevronsLeftRightIcon,
  ChevronsRightLeftIcon,
  ChevronsUpDownIcon,
  PlugIcon,
  RulerDimensionLineIcon,
} from "lucide-react";
import type { ShapeValue } from "@mechane/domain/shapes";

import {
  ComboboxContent,
  ComboboxGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
} from "../combobox";
import { InlineColorPicker } from "./color-picker";
import { cn } from "../../../lib/utils";
import type {
  PropertyInputConstraints,
  PropertyInputMenuItem,
  PropertyInputPreset,
  PropertyInputSizing,
  PropertyInputType,
  VariableReference,
} from "./property-input-types";
export function Menu<T extends ShapeValue>({
  inputType,
  colorText,
  dimension,
  sizing,
  constraints,
  presets,
  menuItems,
  auto,
  allowAuto,
  allowLink = true,
  linkedVariable,
  onColorChange,
}: {
  inputType: PropertyInputType;
  colorText: string;
  dimension?: "width" | "height";
  sizing: PropertyInputSizing;
  constraints?: PropertyInputConstraints;
  presets?: readonly PropertyInputPreset[];
  menuItems?: readonly PropertyInputMenuItem[];
  auto: boolean;
  allowAuto?: boolean;
  allowLink?: boolean;
  linkedVariable: VariableReference<T> | null;
  onColorChange: (value: string | null) => void;
}) {
  const hasMenuItems =
    inputType === "color" ||
    dimension !== undefined ||
    (presets?.length ?? 0) > 0 ||
    (menuItems?.length ?? 0) > 0 ||
    allowAuto ||
    allowLink;
  if (!hasMenuItems) return null;

  return (
    <ComboboxContent className={cn("p-0.5 min-w-fit", inputType === "color" && "overflow-y-auto")}>
      {inputType === "color" ? (
        <>
          <InlineColorPicker value={colorText} onChange={onColorChange} />
          <ComboboxSeparator />
        </>
      ) : null}
      <ComboboxList>
        {menuItems && menuItems.length > 0 ? (
          <>
            <ComboboxGroup>
              {menuItems.map((item) => (
                <ComboboxItem key={item.value} value={item.value}>
                  {item.icon}
                  {item.label}
                </ComboboxItem>
              ))}
            </ComboboxGroup>
            <ComboboxSeparator />
          </>
        ) : null}
        {dimension ? (
          <DimensionMenu dimension={dimension} sizing={sizing} constraints={constraints} />
        ) : null}
        <AutoPresetMenu presets={presets} auto={auto} />
        <PresetsMenu presets={presets} />
        <ConnectionMenu
          allowAuto={allowAuto}
          allowLink={allowLink}
          auto={auto}
          presets={presets}
          linkedVariable={linkedVariable}
        />
      </ComboboxList>
    </ComboboxContent>
  );
}

function DimensionMenu({
  dimension,
  sizing,
  constraints,
}: {
  dimension: "width" | "height";
  sizing: PropertyInputSizing;
  constraints?: PropertyInputConstraints;
}) {
  return (
    <>
      <ComboboxGroup>
        <ComboboxItem value="fixed">
          <RulerDimensionLineIcon className={cn(dimension === "height" && "rotate-90")} />
          Fixed {dimension}
          <CheckIcon className={cn("ml-auto", sizing === "fixed" ? "opacity-100" : "opacity-0")} />
        </ComboboxItem>
        <ComboboxItem value="fill">
          {dimension === "width" ? <ChevronsLeftRightIcon /> : <ChevronsUpDownIcon />}Fill container
          <CheckIcon className={cn("ml-auto", sizing === "fill" ? "opacity-100" : "opacity-0")} />
        </ComboboxItem>
        <ComboboxItem value="hug">
          {dimension === "width" ? <ChevronsRightLeftIcon /> : <ChevronsDownUpIcon />}Hug contents
          <CheckIcon className={cn("ml-auto", sizing === "hug" ? "opacity-100" : "opacity-0")} />
        </ComboboxItem>
      </ComboboxGroup>
      <ComboboxSeparator />
      <ComboboxGroup>
        <ComboboxItem value="add-min">
          Add min {dimension}
          <CheckIcon className={cn("ml-auto", constraints?.min ? "opacity-100" : "opacity-0")} />
        </ComboboxItem>
        <ComboboxItem value="add-max">
          Add max {dimension}
          <CheckIcon className={cn("ml-auto", constraints?.max ? "opacity-100" : "opacity-0")} />
        </ComboboxItem>
      </ComboboxGroup>
      <ComboboxSeparator />
    </>
  );
}

function AutoPresetMenu({
  presets,
  auto,
}: {
  presets?: readonly PropertyInputPreset[];
  auto: boolean;
}) {
  if (!presets?.includes("auto")) return null;
  return (
    <>
      <ComboboxGroup>
        <ComboboxItem value="auto">
          Auto
          <CheckIcon className={cn("ml-auto", auto ? "opacity-100" : "opacity-0")} />
        </ComboboxItem>
      </ComboboxGroup>
      <ComboboxSeparator />
    </>
  );
}

function PresetsMenu({ presets }: { presets?: readonly PropertyInputPreset[] }) {
  if (!presets || presets.length === 0) return null;
  return (
    <>
      <ComboboxGroup>
        {presets.map((preset) =>
          preset === "auto" ? null : (
            <ComboboxItem key={String(preset)} value={String(preset)}>
              {preset}
            </ComboboxItem>
          ),
        )}
      </ComboboxGroup>
      <ComboboxSeparator />
    </>
  );
}

function ConnectionMenu<T extends ShapeValue>({
  allowAuto,
  allowLink,
  auto,
  presets,
  linkedVariable,
}: {
  allowAuto?: boolean;
  allowLink?: boolean;
  auto: boolean;
  presets?: readonly PropertyInputPreset[];
  linkedVariable: VariableReference<T> | null;
}) {
  return (
    <ComboboxGroup>
      {allowAuto && !presets?.includes("auto") ? (
        <ComboboxItem value="auto">
          Auto
          <CheckIcon className={cn("ml-auto", auto ? "opacity-100" : "opacity-0")} />
        </ComboboxItem>
      ) : null}
      {allowLink ? (
        <ComboboxItem value="connect">
          <PlugIcon />
          {linkedVariable ? "Change variable…" : "Connect variable…"}
        </ComboboxItem>
      ) : null}
    </ComboboxGroup>
  );
}
