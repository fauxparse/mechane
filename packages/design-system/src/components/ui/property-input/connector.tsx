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
          d="M14.4867 12L9.15333 2.66665C9.03704 2.46146 8.8684 2.29078 8.66462 2.17203C8.46083 2.05329 8.22919 1.99072 7.99333 1.99072C7.75748 1.99072 7.52584 2.05329 7.32205 2.17203C7.11827 2.29078 6.94962 2.46146 6.83333 2.66665L1.5 12C1.38246 12.2036 1.32082 12.4346 1.32134 12.6697C1.32186 12.9047 1.38452 13.1355 1.50296 13.3385C1.62141 13.5416 1.79143 13.7097 1.9958 13.8259C2.20016 13.942 2.43161 14.0021 2.66667 14H13.3333C13.5673 13.9997 13.797 13.938 13.9995 13.8208C14.202 13.7037 14.3701 13.5354 14.487 13.3327C14.6039 13.1301 14.6654 12.9002 14.6653 12.6663C14.6652 12.4324 14.6036 12.2026 14.4867 12Z"
        />
        <path
          className="fill-destructive-foreground"
          d="M7.33333 8.66668V6.00001C7.33333 5.63182 7.63181 5.33334 8 5.33334C8.36819 5.33334 8.66667 5.63182 8.66667 6.00001V8.66668C8.66667 9.03487 8.36819 9.33334 8 9.33334C7.63181 9.33334 7.33333 9.03487 7.33333 8.66668ZM8.00651 10.6667C8.3747 10.6667 8.67318 10.9651 8.67318 11.3333C8.67318 11.7015 8.3747 12 8.00651 12H8C7.63181 12 7.33333 11.7015 7.33333 11.3333C7.33333 10.9651 7.63181 10.6667 8 10.6667H8.00651Z"
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
  const [trigger, tooltip] =
    state.kind === "formula"
      ? [button("Edit Formula"), state.source ?? "Edit Formula"]
      : state.kind === "variable"
        ? [<PopoverTrigger render={button("Change variable")} />, state.name]
        : [<ComboboxPrimitive.Trigger render={button("Change sizing")} />, "Change sizing"];

  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
