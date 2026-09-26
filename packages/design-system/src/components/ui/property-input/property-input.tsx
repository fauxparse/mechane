import { useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import type { ShapeValue } from "@mechane/domain/shapes";

import { Combobox, ComboboxInput } from "../combobox";
import { Popover, PopoverContent } from "../popover";
import { Addons } from "./addons";
import { ConnectionChip, MenuChevron, type ChipState } from "./connector";
import { hasMenuContent, Menu } from "./menu";
import { VariablePicker } from "./variable-picker";
import { usePropertyInput } from "./use-property-input";
import type { PropertyInputProps } from "./property-input-types";
import { cn } from "../../../lib/utils";
import { useVibe, type Vibe } from "../../inspector-vibe";

export * from "./property-input-types";

const handleInputFocus = (event: FocusEvent<HTMLInputElement>) => {
  event.currentTarget.select();
};

export const PropertyInput = <T extends ShapeValue>({
  className,
  icon,
  value,
  formula,
  type = "text",
  renderInactiveValue,
  actions,
  ariaLabel,
  placeholder,
  dimension,
  unit = "px",
  sizing,
  variables,
  min,
  max,
  step,
  presets,
  menuItems,
  scrubScale = 2,
  constraints,
  allowAuto,
  allowLink = true,
  auto,
  disabled = false,
  brokenVariable = false,
  vibe: vibeProp,
  onChange,
  onSizingChange,
  onMenuItemSelect,
  onAutoChange,
  onConstraintToggle,
  onValidationError,
  onKeyDown,
}: PropertyInputProps<T> & { vibe?: Vibe }) => {
  const vibe = useVibe(vibeProp);
  const [inputActive, setInputActive] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const input = usePropertyInput({
    value,
    type,
    dimension,
    unit,
    sizing,
    variables,
    min,
    max,
    step,
    presets,
    menuItems,
    scrubScale,
    allowAuto,
    auto,
    onChange,
    onSizingChange,
    onMenuItemSelect,
    onAutoChange,
    onValidationError,
    constraints,
    onConstraintToggle,
  });
  const chip: ChipState | null = formula
    ? {
        kind: "formula",
        blocked: formula.blocked === true,
        source: formula.source,
        onOpen: formula.onOpen,
      }
    : dimension && input.currentSizing !== "fixed"
      ? { kind: "sizing", sizing: input.currentSizing, dimension }
      : input.linkedVariable
        ? { kind: "variable", name: input.linkedVariable.name, broken: brokenVariable }
        : null;
  const inactiveValue = renderInactiveValue?.(input.currentValue);
  const hasInactiveValue =
    !chip && !inputActive && inactiveValue !== null && inactiveValue !== undefined;
  const showMenuChevron =
    !chip &&
    !disabled &&
    hasMenuContent({
      inputType: input.inputType,
      dimension,
      presets,
      menuItems,
      allowAuto,
      allowLink,
    });
  const scrubbable = input.inputType === "number" && !chip && !disabled;
  const activateInput = () => {
    input.inputElementRef.current?.focus();
  };
  const handleInactiveKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activateInput();
  };

  return (
    <Popover open={input.variablesOpen} onOpenChange={input.setVariablesOpen}>
      <div
        ref={rowRef}
        className={cn("group/property-input w-full min-w-0", className)}
        data-linked={input.linkedVariable ? true : undefined}
        data-formula={formula ? (formula.blocked ? "blocked" : "active") : undefined}
        data-vibe={vibe}
      >
        <Combobox
          value={null}
          disabled={disabled}
          inputValue={formula ? formula.text : input.inputText}
          onValueChange={input.handleMenuValueChange}
          onOpenChange={(open) => {
            if (!open) input.commitDraftInput();
          }}
          onInputValueChange={(nextValue, eventDetails) => {
            if (formula) return;
            if (
              eventDetails.reason === "input-change" &&
              eventDetails.event.target instanceof HTMLInputElement &&
              eventDetails.event.target.dataset.slot === "combobox-input"
            )
              input.updateDraftInput(nextValue);
          }}
        >
          <ComboboxInput
            vibe={vibe}
            type="text"
            ref={input.inputElementRef}
            inputMode={input.inputType === "number" ? "decimal" : undefined}
            aria-label={ariaLabel ?? placeholder ?? input.inputType}
            placeholder={placeholder ?? "(none)"}
            disabled={disabled}
            // A chip stands in for the entry: the row reads its value and the chip edits it.
            readOnly={chip ? true : undefined}
            tabIndex={chip ? -1 : undefined}
            className={cn(
              "h-7 w-full min-w-0 gap-0 rounded-sm border-0 p-0.5",
              // Disabled dims the row as a whole; a disabled action inside an enabled row does not.
              disabled ? "has-disabled:opacity-50" : "has-disabled:opacity-100",
              vibe === "table"
                ? "h-full rounded-none bg-transparent has-disabled:bg-transparent dark:bg-transparent"
                : "bg-muted/50 has-disabled:bg-muted/50 dark:bg-muted/50",
              "*:data-[slot=combobox-input]:h-full *:data-[slot=combobox-input]:px-1 *:data-[slot=combobox-input]:text-sm *:data-[slot=combobox-input]:tabular-nums *:data-[slot=combobox-input]:text-foreground *:data-[slot=combobox-input]:placeholder:text-muted-foreground/50",
              "*:data-[slot=combobox-input]:disabled:opacity-100",
              (hasInactiveValue || chip) &&
                "[&>input]:pointer-events-none [&>input]:absolute [&>input]:w-0 *:data-[slot=combobox-input]:p-0 [&>input]:opacity-0 [&>input]:disabled:opacity-0",
            )}
            showTrigger={false}
            onFocus={(event) => {
              setInputActive(true);
              handleInputFocus(event);
            }}
            onBlur={() => {
              input.commitDraftInput();
              setInputActive(false);
            }}
            onKeyDown={(event) => {
              if (formula && event.key === "Enter") {
                event.preventDefault();
                formula.onOpen();
                return;
              }
              if (input.handleInputKeyDown(event)) onKeyDown?.(event);
            }}
          >
            {hasInactiveValue && (
              <button
                type="button"
                aria-label={ariaLabel ?? placeholder ?? `Edit ${input.inputType}`}
                disabled={disabled}
                className="min-w-0 flex-1 truncate border-0 bg-transparent px-1 py-0 text-left text-sm tabular-nums text-foreground"
                onPointerDown={(event) => {
                  event.preventDefault();
                  activateInput();
                }}
                onKeyDown={handleInactiveKeyDown}
              >
                {inactiveValue}
              </button>
            )}
            {chip ? (
              <ConnectionChip
                state={chip}
                inputType={input.inputType}
                // A Variable with no single value to read (a runtime item) is named instead.
                text={
                  formula
                    ? formula.text
                    : input.displayText || (chip.kind === "variable" ? chip.name : "")
                }
                placeholder={placeholder ?? "(none)"}
                disabled={disabled}
                onKeyDown={(event) => {
                  if (event.key !== "Backspace" || !input.editVariableValue()) return;
                  event.preventDefault();
                  activateInput();
                }}
              />
            ) : null}
            <Addons
              icon={icon}
              swatch={
                input.inputType === "color" && !chip
                  ? { colorText: input.colorText, disabled }
                  : null
              }
              onScrubPointerDown={scrubbable ? input.handleScrubPointerDown : undefined}
              onScrubPointerMove={
                scrubbable && input.isScrubbing ? input.handleScrubPointerMove : undefined
              }
              onScrubPointerEnd={
                scrubbable && input.isScrubbing ? input.handleScrubPointerEnd : undefined
              }
              actions={actions}
            />
            {showMenuChevron ? <MenuChevron /> : null}
          </ComboboxInput>
          <Menu
            inputType={input.inputType}
            colorText={input.colorText}
            dimension={dimension}
            sizing={input.currentSizing}
            presets={presets}
            menuItems={menuItems}
            auto={input.auto}
            allowAuto={allowAuto}
            allowLink={allowLink}
            linkedVariable={input.linkedVariable}
            onColorChange={input.updateDraftInput}
          />
        </Combobox>
      </div>
      <PopoverContent
        anchor={rowRef}
        align="end"
        sideOffset={10}
        alignOffset={-4}
        className="gap-0 overflow-hidden p-0"
      >
        <VariablePicker
          query={input.variableQuery}
          variables={input.filteredVariables}
          totalVariables={variables?.length ?? 0}
          linkedVariable={input.linkedVariable}
          onQueryChange={input.setVariableQuery}
          onClose={() => input.setVariablesOpen(false)}
          onSelect={input.selectVariable}
          onDisconnect={input.disconnectVariable}
        />
      </PopoverContent>
    </Popover>
  );
};
