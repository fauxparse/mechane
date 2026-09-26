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
import type { KeyboardEventHandler, ReactNode } from "react";

import { cn } from "../../../lib/utils";
import { InputGroupAddon } from "../input-group";
import { PopoverTrigger } from "../popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../tooltip";
import { isLightColor, parseHexColor, rgbaToHex } from "./color-utils";
import type { PropertyInputType } from "./property-input-types";

/**
 * Where a Property's value comes from when it is not a literal. A size's Fill/Hug, a Variable
 * and a Formula are mutually exclusive; each draws the row as a chip reading the resolved value,
 * and pressing the chip opens what owns it. A literal keeps its entry and a trailing chevron.
 */
export type ChipState =
  /** A size taking its extent from the layout; opens the menu that owns the mode. */
  | {
      readonly kind: "sizing";
      readonly sizing: "fill" | "hug";
      readonly dimension: "width" | "height";
    }
  /** A connected Variable; opens the Variable picker. */
  | { readonly kind: "variable"; readonly name: string; readonly broken: boolean }
  /** A Formula drives the value; opens its editor. */
  | {
      readonly kind: "formula";
      readonly blocked: boolean;
      readonly source?: string;
      onOpen(): void;
    };

function ChipIcon({ state, className }: { state: ChipState; className: string }) {
  switch (state.kind) {
    case "formula":
      return <FormulaIcon className={className} />;
    case "variable":
      return <PlugIcon className={className} />;
    case "sizing":
      if (state.sizing === "fill")
        return state.dimension === "width" ? (
          <ChevronsLeftRightIcon className={className} />
        ) : (
          <ChevronsUpDownIcon className={className} />
        );
      return state.dimension === "width" ? (
        <ChevronsRightLeftIcon className={className} />
      ) : (
        <ChevronsDownUpIcon className={className} />
      );
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

/**
 * A Color chip leads with the resolved color, marked with where it comes from. A broken one has
 * no color to show, so a filled warning takes the swatch's place.
 */
function ChipSwatch({ state, text, broken }: { state: ChipState; text: string; broken: boolean }) {
  if (broken)
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 shrink-0">
        <path
          className="fill-destructive"
          d="M14.49 12L9.15 2.67C9.04 2.46 8.87 2.29 8.66 2.17C8.46 2.05 8.23 1.99 7.99 1.99C7.76 1.99 7.53 2.05 7.32 2.17C7.12 2.29 6.95 2.46 6.83 2.67L1.5 12C1.38 12.2 1.32 12.43 1.32 12.67C1.32 12.9 1.38 13.14 1.5 13.34C1.62 13.54 1.79 13.71 2 13.83C2.2 13.94 2.43 14 2.67 14H13.33C13.57 14 13.8 13.94 14 13.82C14.2 13.7 14.37 13.54 14.49 13.33C14.6 13.13 14.67 12.9 14.67 12.67C14.67 12.43 14.6 12.2 14.49 12Z"
        />
        <path
          className="fill-destructive-foreground"
          d="M7.33 8.67V6C7.33 5.63 7.63 5.33 8 5.33C8.37 5.33 8.67 5.63 8.67 6V8.67C8.67 9.03 8.37 9.33 8 9.33C7.63 9.33 7.33 9.03 7.33 8.67ZM8.01 10.67C8.37 10.67 8.67 10.97 8.67 11.33C8.67 11.7 8.37 12 8.01 12H8C7.63 12 7.33 11.7 7.33 11.33C7.33 10.97 7.63 10.67 8 10.67H8.01Z"
        />
      </svg>
    );
  const parsed = parseHexColor(text);
  return (
    <span
      aria-hidden="true"
      className="flex size-4 shrink-0 items-center justify-center rounded-[2px]"
      style={parsed ? { backgroundColor: rgbaToHex(parsed) } : undefined}
    >
      <ChipIcon
        state={state}
        className={cn("size-3", parsed && isLightColor(parsed) ? "text-black/50" : "text-white/50")}
      />
    </span>
  );
}

/** The trailing chevron onto the Property menu, for a row with no chip; shown on hover or focus. */
export function MenuChevron() {
  return (
    <InputGroupAddon
      align="inline-end"
      data-connector="menu"
      className="hidden h-full w-6 p-0 group-hover/property-input:flex group-focus-within/property-input:flex has-[>button]:mr-0"
    >
      <ComboboxPrimitive.Trigger
        aria-label="Property options"
        className="flex size-6 cursor-pointer items-center justify-center rounded-xs text-muted-foreground/50 outline-none hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <ChevronDownIcon aria-hidden="true" className="size-4" />
      </ComboboxPrimitive.Trigger>
    </InputGroupAddon>
  );
}

/**
 * The resolved value on a chip: the icon says where it comes from, and the whole chip opens
 * the Formula editor, the Variable picker, or the sizing menu.
 */
export function ConnectionChip({
  state,
  inputType,
  text,
  placeholder,
  disabled,
  onKeyDown,
}: {
  state: ChipState;
  inputType: PropertyInputType;
  text: string;
  placeholder?: string;
  disabled: boolean;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
}) {
  const broken =
    (state.kind === "formula" && state.blocked) || (state.kind === "variable" && state.broken);
  const content: ReactNode = (
    <>
      {inputType === "color" ? (
        <ChipSwatch state={state} text={text} broken={broken} />
      ) : (
        <ChipIcon
          state={state}
          className={cn("size-4 shrink-0", broken ? "text-destructive" : "text-muted-foreground")}
        />
      )}
      <span
        className={cn("min-w-0 flex-1 truncate tabular-nums", !text && "text-muted-foreground/50")}
      >
        {text || placeholder}
      </span>
      {disabled ? null : (
        <ChevronDownIcon
          aria-hidden="true"
          className="hidden size-4 shrink-0 text-muted-foreground/50 group-hover/property-input:block group-focus-within/property-input:block"
        />
      )}
    </>
  );
  const button = (label: string) => (
    <button
      type="button"
      aria-label={label}
      data-connector={state.kind}
      data-broken={broken ? true : undefined}
      disabled={disabled}
      className="flex h-6 min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-xs bg-chip/25 px-1 text-left text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed"
      onKeyDown={onKeyDown}
      onClick={state.kind === "formula" ? state.onOpen : undefined}
    >
      {content}
    </button>
  );
  // The tooltip names what the chip no longer shows: the Formula's source, the Variable's name.
  let trigger: ReactNode;
  let tooltip: string;
  if (state.kind === "formula") {
    trigger = button("Edit Formula");
    tooltip = state.source ?? "Edit Formula";
  } else if (state.kind === "variable") {
    trigger = <PopoverTrigger render={button("Change variable")} />;
    tooltip = state.name;
  } else {
    trigger = <ComboboxPrimitive.Trigger render={button("Change sizing")} />;
    tooltip = "Change sizing";
  }

  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
