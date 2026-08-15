import {
  CheckIcon,
  ChevronsDownUpIcon,
  ChevronsLeftRightIcon,
  ChevronsRightLeftIcon,
  ChevronsUpDownIcon,
  PlugIcon,
  RulerDimensionLineIcon,
} from "lucide-react";
import type { ShapeValue } from "@mechane/domain";

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
  PropertyInputSizing,
  PropertyInputType,
  VariableReference,
} from "./property-input-types";

export function Menu<T extends ShapeValue>({
  inputType,
  colorText,
  dimension,
  sizing,
  auto,
  allowAuto,
  linkedVariable,
  onColorChange,
}: {
  inputType: PropertyInputType;
  colorText: string;
  dimension?: "width" | "height";
  sizing: PropertyInputSizing;
  auto: boolean;
  allowAuto?: boolean;
  linkedVariable: VariableReference<T> | null;
  onColorChange: (value: string | null) => void;
}) {
  return (
    <ComboboxContent className={cn("p-0.5 min-w-fit", inputType === "color" && "overflow-y-auto")}>
      {inputType === "color" && (
        <>
          <InlineColorPicker value={colorText} onChange={onColorChange} />
          <ComboboxSeparator />
        </>
      )}
      <ComboboxList>
        {dimension && (
          <>
            <ComboboxGroup>
              <ComboboxItem value="fixed">
                <RulerDimensionLineIcon className={cn(dimension === "height" && "rotate-90")} />
                Fixed {dimension}
                <CheckIcon
                  className={cn("ml-auto", sizing === "fixed" ? "opacity-100" : "opacity-0")}
                />
              </ComboboxItem>
              <ComboboxItem value="fill">
                {dimension === "width" ? <ChevronsLeftRightIcon /> : <ChevronsUpDownIcon />}Fill
                container
                <CheckIcon
                  className={cn("ml-auto", sizing === "fill" ? "opacity-100" : "opacity-0")}
                />
              </ComboboxItem>
              <ComboboxItem value="hug">
                {dimension === "width" ? <ChevronsRightLeftIcon /> : <ChevronsDownUpIcon />}Hug
                contents
                <CheckIcon
                  className={cn("ml-auto", sizing === "hug" ? "opacity-100" : "opacity-0")}
                />
              </ComboboxItem>
            </ComboboxGroup>
            <ComboboxSeparator />
            <ComboboxGroup>
              <ComboboxItem value="add-min">
                <CheckIcon className="opacity-0" />
                Add min {dimension}
              </ComboboxItem>
              <ComboboxItem value="add-max">
                <CheckIcon className="opacity-0" />
                Add max {dimension}
              </ComboboxItem>
            </ComboboxGroup>
            <ComboboxSeparator />
          </>
        )}
        <ComboboxGroup>
          {allowAuto && (
            <ComboboxItem value="auto">
              Auto
              <CheckIcon className={cn("ml-auto", auto ? "opacity-100" : "opacity-0")} />
            </ComboboxItem>
          )}
          <ComboboxItem value="connect">
            <PlugIcon />
            {linkedVariable ? "Change variable…" : "Connect variable…"}
          </ComboboxItem>
        </ComboboxGroup>
      </ComboboxList>
    </ComboboxContent>
  );
}
