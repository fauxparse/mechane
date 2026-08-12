import type { ShapeValue } from "@mechane/domain";
import type { FocusEvent } from "react";

import { Combobox, ComboboxInput } from "../combobox";
import { Popover, PopoverContent } from "../popover";
import { Addons } from "./addons";
import { Connector } from "./connector";
import { Menu } from "./menu";
import { VariablePicker } from "./variable-picker";
import { usePropertyInput } from "./use-property-input";
import type { PropertyInputProps } from "./property-input-types";

export * from "./property-input-types";

const handleInputFocus = (event: FocusEvent<HTMLInputElement>) => {
  event.currentTarget.select();
};

export const PropertyInput = <T extends ShapeValue>({
  icon,
  value,
  type = "text",
  placeholder,
  dimension,
  unit = "px",
  sizing,
  variables,
  min,
  max,
  step,
  scrubScale = 2,
  onChange,
  onSizingChange,
  onConstraintAdd,
}: PropertyInputProps<T>) => {
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
    scrubScale,
    onChange,
    onSizingChange,
    onConstraintAdd,
  });
  const connectorLabel = input.linkedVariable
    ? "Disconnect variable"
    : input.currentSizing === "fixed"
      ? "Connect variable"
      : `${input.currentSizing === "fill" ? "Fill" : "Hug"} ${dimension}`;

  return (
    <Popover open={input.variablesOpen} onOpenChange={input.setVariablesOpen}>
      <div
        className="group/property-input w-full min-w-0"
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
            className="w-full min-w-0 bg-muted/50 dark:bg-muted/50 border-0 *:data-[slot=combobox-input]:px-0 rounded-sm h-7 data-[slot=combobox-input]:h-7"
            showTrigger={false}
            onFocus={handleInputFocus}
            onBlur={input.commitDraftInput}
            onKeyDown={input.handleInputKeyDown}
          >
            <Addons
              icon={icon}
              inputType={input.inputType}
              colorText={input.colorText}
              linkedVariable={input.linkedVariable}
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
            dimension={dimension}
            sizing={input.currentSizing}
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
