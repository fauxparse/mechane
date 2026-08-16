import { useState, type FocusEvent, type KeyboardEvent } from "react";
import type { ShapeValue } from "@mechane/domain";

import { Combobox, ComboboxInput } from "../combobox";
import { Popover, PopoverContent } from "../popover";
import { Addons } from "./addons";
import { Connector } from "./connector";
import { Menu } from "./menu";
import { VariablePicker } from "./variable-picker";
import { usePropertyInput } from "./use-property-input";
import type { PropertyInputProps } from "./property-input-types";
import { cn } from "../../../lib/utils";

export * from "./property-input-types";

const handleInputFocus = (event: FocusEvent<HTMLInputElement>) => {
  event.currentTarget.select();
};

export const PropertyInput = <T extends ShapeValue>({
  className,
  icon,
  value,
  type = "text",
  renderInactiveValue,
  placeholder,
  dimension,
  unit = "px",
  sizing,
  variables,
  max,
  step,
  presets,
  scrubScale = 2,
  allowAuto,
  allowLink = true,
  auto,
  onChange,
  onSizingChange,
  onAutoChange,
  onConstraintAdd,
}: PropertyInputProps<T>) => {
  const [inputActive, setInputActive] = useState(false);
  const input = usePropertyInput({
    value,
    type,
    dimension,
    unit,
    sizing,
    variables,
    max,
    step,
    presets,
    scrubScale,
    allowAuto,
    auto,
    onChange,
    onSizingChange,
    onAutoChange,
    onConstraintAdd,
  });
  const inactiveValue = renderInactiveValue?.(input.currentValue);
  const hasInactiveValue =
    !inputActive && !input.linkedVariable && inactiveValue !== null && inactiveValue !== undefined;
  const activateInput = () => {
    input.inputElementRef.current?.focus();
  };
  const handleInactiveKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activateInput();
  };
  const connectorLabel = input.linkedVariable
    ? "Disconnect variable"
    : input.currentSizing === "fixed"
      ? "Connect variable"
      : `${input.currentSizing === "fill" ? "Fill" : "Hug"} ${dimension}`;

  return (
    <Popover open={input.variablesOpen} onOpenChange={input.setVariablesOpen}>
      <div
        className={cn("group/property-input w-full min-w-0", className)}
        data-linked={input.linkedVariable ? true : undefined}
      >
        <Combobox
          value={null}
          inputValue={input.inputText}
          onValueChange={input.handleMenuValueChange}
          onOpenChange={(open) => {
            if (!open) input.commitDraftInput();
          }}
          onInputValueChange={(nextValue, eventDetails) => {
            if (
              eventDetails.reason === "input-change" &&
              eventDetails.event.target instanceof HTMLInputElement &&
              eventDetails.event.target.dataset.slot === "combobox-input"
            )
              input.updateDraftInput(nextValue);
          }}
        >
          <ComboboxInput
            type="text"
            ref={input.inputElementRef}
            inputMode={input.inputType === "number" ? "decimal" : undefined}
            aria-label={placeholder ?? input.inputType}
            placeholder={placeholder}
            className={cn(
              "w-full min-w-0 bg-muted/50 dark:bg-muted/50 border-0 *:data-[slot=combobox-input]:px-1 rounded-sm h-7 data-[slot=combobox-input]:h-7",
              !icon && "pl-2",
              hasInactiveValue &&
                "[&>input]:pointer-events-none [&>input]:w-0 [&>input]:flex-none *:data-[slot=combobox-input]:p-0 [&>input]:opacity-0",
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
            onKeyDown={input.handleInputKeyDown}
          >
            {hasInactiveValue && (
              <button
                type="button"
                aria-label={placeholder ?? `Edit ${input.inputType}`}
                className={cn(
                  "min-w-0 flex-1 truncate border-0 bg-transparent px-1 py-0 text-left text-sm",
                )}
                onPointerDown={(event) => {
                  event.preventDefault();
                  activateInput();
                }}
                onKeyDown={handleInactiveKeyDown}
              >
                {inactiveValue}
              </button>
            )}
            <Addons
              icon={icon}
              inputType={input.inputType}
              colorText={input.colorText}
              linkedVariable={input.linkedVariable}
              allowLink={allowLink}
              dimension={dimension}
              unit={unit}
              onScrubPointerDown={input.handleScrubPointerDown}
              onScrubPointerMove={input.handleScrubPointerMove}
              onScrubPointerEnd={input.handleScrubPointerEnd}
              connector={
                <Connector
                  dimension={dimension}
                  sizing={input.currentSizing}
                  label={connectorLabel}
                  linkedVariable={input.linkedVariable}
                />
              }
            />
          </ComboboxInput>
          <Menu
            inputType={input.inputType}
            colorText={input.colorText}
            sizing={input.currentSizing}
            presets={presets}
            auto={input.auto}
            allowAuto={allowAuto}
            linkedVariable={input.linkedVariable}
            onColorChange={input.updateDraftInput}
          />
        </Combobox>
      </div>
      <PopoverContent
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
