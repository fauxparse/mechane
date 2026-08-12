import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import {
  ChevronsDownUpIcon,
  ChevronsLeftRightIcon,
  ChevronsRightLeftIcon,
  ChevronsUpDownIcon,
  PlugIcon,
  RulerDimensionLineIcon,
} from "lucide-react";
import type { ShapeValue } from "@mechane/domain";

import { InputGroupAddon, InputGroupButton } from "../input-group";
import { PopoverTrigger } from "../popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../tooltip";
import { cn } from "../../../lib/utils";
import type { PropertyInputSizing, VariableReference } from "./property-input-types";

function SizingIcon({
  sizing,
  dimension,
}: {
  sizing: PropertyInputSizing;
  dimension?: "width" | "height";
}) {
  if (sizing === "fill")
    return dimension === "width" ? <ChevronsLeftRightIcon /> : <ChevronsUpDownIcon />;
  if (sizing === "hug")
    return dimension === "width" ? <ChevronsRightLeftIcon /> : <ChevronsDownUpIcon />;
  return <RulerDimensionLineIcon className={cn(dimension === "height" && "rotate-90")} />;
}

export function Connector<T extends ShapeValue>({
  dimension,
  sizing,
  label,
}: {
  dimension?: "width" | "height";
  sizing: PropertyInputSizing;
  label: string;
  linkedVariable: VariableReference<T> | null;
}) {
  return (
    <InputGroupAddon
      align="inline-end"
      className="opacity-0 group-hover/property-input:opacity-100 group-focus-within/property-input:opacity-100 group-data-linked/property-input:opacity-100"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            dimension && sizing !== "fixed" ? (
              <ComboboxPrimitive.Trigger
                render={
                  <InputGroupButton
                    aria-label="Change sizing"
                    className="bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <SizingIcon sizing={sizing} dimension={dimension} />
                  </InputGroupButton>
                }
              />
            ) : (
              <PopoverTrigger
                render={
                  <InputGroupButton
                    aria-label={label}
                    className="p-0 aspect-square group-data-linked/property-input:bg-accent group-data-linked/property-input:text-accent-foreground"
                  >
                    <PlugIcon />
                  </InputGroupButton>
                }
              />
            )
          }
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <span className="sr-only">{label}</span>
    </InputGroupAddon>
  );
}
