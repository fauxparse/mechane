import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import {
  ChevronDownIcon,
  ChevronsDownUpIcon,
  ChevronsLeftRightIcon,
  ChevronsRightLeftIcon,
  ChevronsUpDownIcon,
  FlaskConicalIcon as FormulaIcon,
  PlugIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../../lib/utils";
import { InputGroupAddon, InputGroupButton } from "../input-group";
import { PopoverTrigger } from "../popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../tooltip";

/**
 * What the trailing button says about the Property's value, and what pressing it does. A size's
 * Fill/Hug, a Variable and a Formula are mutually exclusive, so exactly one state applies.
 */
export type ConnectorState =
  /** A literal or nothing: a plain chevron onto the Property menu, shown on hover or focus. */
  | { readonly kind: "menu" }
  /** A size taking its extent from the layout; opens the menu that owns the mode. */
  | {
      readonly kind: "sizing";
      readonly sizing: "fill" | "hug";
      readonly dimension: "width" | "height";
    }
  /** A connected Variable; opens the Variable picker. */
  | { readonly kind: "variable" }
  /** A Formula drives the value; opens its editor. */
  | { readonly kind: "formula"; readonly blocked: boolean; onOpen(): void };

const ACCENT =
  "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground";
const BUTTON = "p-0 h-5 rounded-xs aspect-square";

function SizingIcon({
  sizing,
  dimension,
}: {
  sizing: "fill" | "hug";
  dimension: "width" | "height";
}) {
  if (sizing === "fill")
    return dimension === "width" ? <ChevronsLeftRightIcon /> : <ChevronsUpDownIcon />;
  return dimension === "width" ? <ChevronsRightLeftIcon /> : <ChevronsDownUpIcon />;
}

export function Connector({ state }: { state: ConnectorState }) {
  const label =
    state.kind === "formula"
      ? "Edit Formula"
      : state.kind === "variable"
        ? "Change variable"
        : state.kind === "sizing"
          ? "Change sizing"
          : "Property options";
  const menuTrigger = (className: string, icon: ReactNode) => (
    <ComboboxPrimitive.Trigger
      render={
        <InputGroupButton aria-label={label} className={cn(BUTTON, className)}>
          {icon}
        </InputGroupButton>
      }
    />
  );
  const trigger =
    state.kind === "formula" ? (
      <InputGroupButton
        aria-label={label}
        data-state="formula"
        className={cn(
          BUTTON,
          state.blocked
            ? "bg-destructive text-destructive-foreground hover:bg-destructive hover:text-destructive-foreground"
            : ACCENT,
        )}
        onClick={state.onOpen}
      >
        <FormulaIcon />
      </InputGroupButton>
    ) : state.kind === "variable" ? (
      <PopoverTrigger
        render={
          <InputGroupButton aria-label={label} data-state="variable" className={cn(BUTTON, ACCENT)}>
            <PlugIcon />
          </InputGroupButton>
        }
      />
    ) : state.kind === "sizing" ? (
      menuTrigger(ACCENT, <SizingIcon sizing={state.sizing} dimension={state.dimension} />)
    ) : (
      menuTrigger("", <ChevronDownIcon />)
    );

  return (
    <InputGroupAddon
      align="inline-end"
      data-connector={state.kind}
      className={cn(
        state.kind === "menu" &&
          "opacity-0 group-hover/property-input:opacity-100 group-focus-within/property-input:opacity-100",
      )}
    >
      <Tooltip>
        <TooltipTrigger render={trigger} />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </InputGroupAddon>
  );
}
