import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import {
  CheckIcon,
  ChevronsDownUpIcon,
  ChevronsLeftRightIcon,
  ChevronsRightLeftIcon,
  ChevronsUpDownIcon,
  LucideIcon,
  PlugIcon,
  RulerDimensionLineIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { isFunction, isObject } from "es-toolkit/compat";
import type { SceneVariable, ShapeValue } from "@mechane/domain";
import {
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
} from "../combobox";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "../input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "../tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "../popover";
import { Button } from "../button";
import { cn } from "../../../lib/utils";

export type PropertyInputType = "text" | "number" | "color";
export type PropertyInputSizing = "fixed" | "fill" | "hug";
export type PropertyInputConstraint = "min" | "max";
export type PropertyInputUnit = "px" | "%";

export type VariableReference<T extends ShapeValue> = SceneVariable & {
  current?: T;
};

export type PropertyInputValue<T extends ShapeValue> = T | VariableReference<T>;

export type PropertyInputProps<T extends ShapeValue> = {
  icon?: LucideIcon | string;
  value?: PropertyInputValue<T> | null;
  type?: PropertyInputType;
  placeholder?: string;
  dimension?: "width" | "height";
  unit?: PropertyInputUnit;
  sizing?: PropertyInputSizing;
  variables?: VariableReference<T>[];
  min?: number;
  max?: number;
  step?: number;
  /** Number of pixels required for one scrub step. Higher values scrub more slowly. */
  scrubScale?: number;
  onChange?: (value: PropertyInputValue<T> | null) => void;
  onSizingChange?: (sizing: PropertyInputSizing) => void;
  onConstraintAdd?: (constraint: PropertyInputConstraint) => void;
};

const isIcon = (icon: LucideIcon | string): icon is LucideIcon =>
  isObject(icon) || isFunction(icon);

const isVariableReference = <T extends ShapeValue>(
  value: PropertyInputValue<T> | null | undefined,
): value is VariableReference<T> =>
  value !== null && value !== undefined && "id" in value && "name" in value;

const getInputType = <T extends ShapeValue>(
  value: PropertyInputValue<T> | null | undefined,
  fallback: PropertyInputType,
): PropertyInputType => {
  const kind = isVariableReference(value) ? value.current?.kind : value?.kind;
  const variableType = isVariableReference(value) ? value.type : undefined;

  if (kind === "number" || variableType === "number") return "number";
  if (kind === "colour" || variableType === "colour") return "color";
  if (kind === "text" || variableType === "text") return "text";
  return fallback;
};

const getDisplayValue = <T extends ShapeValue>(
  value: PropertyInputValue<T> | null | undefined,
): T | null => (isVariableReference(value) ? (value.current ?? null) : (value ?? null));
const getValueText = (value: ShapeValue | null | undefined): string =>
  value === null || value === undefined ? "" : String(value.value);

const formatValueText = (
  value: ShapeValue | null | undefined,
  dimension?: "width" | "height",
  unit?: PropertyInputUnit,
): string => {
  const text = getValueText(value);
  return dimension && unit === "%" && value?.kind === "number" && text !== "" ? `${text}%` : text;
};

const getColorInputValue = (value: string): string => {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value
      .slice(1)
      .split("")
      .map((part) => `${part}${part}`)
      .join("")}`;
  }
  return "#000000";
};

const createValue = <T extends ShapeValue>(type: PropertyInputType, value: string | number): T =>
  ({
    kind: type === "color" ? "colour" : type,
    value,
  }) as T;

const renderIcon = (Icon: LucideIcon | string) =>
  isIcon(Icon) ? <Icon aria-hidden="true" /> : <span aria-hidden="true">{Icon}</span>;

export const PropertyInput = <T extends ShapeValue>({
  icon: Icon,
  value,
  type = "text",
  placeholder,
  dimension,
  unit = "px",
  sizing,
  variables = [],
  min,
  max,
  step,
  scrubScale = 2,
  onChange,
  onSizingChange,
  onConstraintAdd,
}: PropertyInputProps<T>) => {
  const [uncontrolledValue, setUncontrolledValue] = useState<PropertyInputValue<T> | null>(
    value ?? null,
  );
  const [uncontrolledSizing, setUncontrolledSizing] = useState<PropertyInputSizing>("fixed");
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [variableQuery, setVariableQuery] = useState("");
  const [editingVariable, setEditingVariable] = useState<VariableReference<T> | null>(null);
  const [draftInputValue, setDraftInputValue] = useState<string | null>(null);
  const draftInputRef = useRef<string | null>(null);
  const scrubOrigin = useRef<{ x: number; value: number } | null>(null);

  const displayedValue = value === undefined ? uncontrolledValue : value;
  const connectedVariable = isVariableReference(displayedValue) ? displayedValue : null;
  const linkedVariable = connectedVariable && editingVariable === null ? connectedVariable : null;
  const currentValue = getDisplayValue(displayedValue);
  const inputType = getInputType(displayedValue, type);
  const currentSizing = sizing ?? uncontrolledSizing;
  const displayText = formatValueText(currentValue, dimension, unit);
  const inputText = linkedVariable ? "" : (draftInputValue ?? displayText);
  const colorText = draftInputValue ?? displayText;
  const filteredVariables = useMemo(() => {
    const query = variableQuery.trim().toLocaleLowerCase();
    return query.length === 0
      ? variables
      : variables.filter((variable) => variable.name.toLocaleLowerCase().includes(query));
  }, [variableQuery, variables]);

  const commit = (nextValue: PropertyInputValue<T> | null) => {
    if (value === undefined) setUncontrolledValue(nextValue);
    onChange?.(nextValue);
  };

  const updateDraftInput = (nextValue: string | null) => {
    draftInputRef.current = nextValue;
    setDraftInputValue(nextValue);
  };

  const parseInputValue = (rawValue: string): PropertyInputValue<T> | null | undefined => {
    if (inputType === "color") {
      return rawValue.trim() === "" ? undefined : createValue<T>(inputType, rawValue);
    }
    if (inputType !== "number") return createValue<T>(inputType, rawValue);

    const numericValue = rawValue.replace(/%/g, "").trim();
    if (numericValue === "") return null;
    const parsed = Number(numericValue);
    if (!Number.isFinite(parsed)) return undefined;
    return createValue<T>(inputType, Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed)));
  };

  const commitRawValue = (rawValue: string | number) => {
    commit(createValue<T>(inputType, rawValue));
  };

  const commitDraftInput = () => {
    const rawValue = draftInputRef.current;
    if (rawValue === null) return;
    const nextValue = parseInputValue(rawValue);
    if (nextValue !== undefined) commit(nextValue);
    updateDraftInput(null);
  };

  const handleInputFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.currentTarget.select();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && linkedVariable && connectedVariable) {
      event.preventDefault();
      setEditingVariable(connectedVariable);
      updateDraftInput(formatValueText(connectedVariable.current, dimension, unit));
      commit(connectedVariable.current ?? null);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      updateDraftInput(null);
      if (editingVariable) {
        commit(editingVariable);
        setEditingVariable(null);
      }
    }
  };
  const handleScrubPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    if (linkedVariable || currentValue?.kind !== "number") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubOrigin.current = { x: event.clientX, value: currentValue.value };
  };

  const handleScrubPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    if (!scrubOrigin.current || currentValue?.kind !== "number") return;
    const unit = step && step > 0 ? step : 1;
    const scale = Math.max(0.1, scrubScale);
    const delta = Math.round((event.clientX - scrubOrigin.current.x) / scale / unit) * unit;
    const nextValue = Math.min(
      max ?? Infinity,
      Math.max(min ?? -Infinity, scrubOrigin.current.value + delta),
    );
    commitRawValue(nextValue);
  };

  const handleScrubPointerEnd = (event: PointerEvent<HTMLSpanElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    scrubOrigin.current = null;
  };

  const commitSizing = (nextSizing: PropertyInputSizing) => {
    if (sizing === undefined) setUncontrolledSizing(nextSizing);
    onSizingChange?.(nextSizing);
  };

  const handleMenuValueChange = (menuValue: string | null) => {
    if (menuValue === "fixed" || menuValue === "fill" || menuValue === "hug") {
      commitSizing(menuValue);
    }
    if (menuValue === "add-min" || menuValue === "add-max") {
      onConstraintAdd?.(menuValue === "add-min" ? "min" : "max");
    }
    if (menuValue === "connect") {
      setVariableQuery("");
      setVariablesOpen(true);
    }
  };
  const selectVariable = (variable: VariableReference<T>) => {
    setEditingVariable(null);
    updateDraftInput(null);
    commit(variable);
    setVariablesOpen(false);
  };

  const disconnectVariable = () => {
    if (linkedVariable) commit(linkedVariable.current ?? null);
    setEditingVariable(null);
    updateDraftInput(null);
    setVariablesOpen(false);
  };
  const sizingIcon =
    currentSizing === "fill" ? (
      dimension === "width" ? (
        <ChevronsLeftRightIcon />
      ) : (
        <ChevronsUpDownIcon />
      )
    ) : currentSizing === "hug" ? (
      dimension === "width" ? (
        <ChevronsRightLeftIcon />
      ) : (
        <ChevronsDownUpIcon />
      )
    ) : (
      <RulerDimensionLineIcon className={cn(dimension === "height" && "rotate-90")} />
    );

  const connectorLabel = linkedVariable
    ? "Disconnect variable"
    : currentSizing === "fixed"
      ? "Connect variable"
      : `${currentSizing === "fill" ? "Fill" : "Hug"} ${dimension}`;

  const connector = (
    <InputGroupAddon
      align="inline-end"
      className="opacity-0 group-hover/property-input:opacity-100 group-focus-within/property-input:opacity-100 group-data-linked/property-input:opacity-100"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            dimension && currentSizing !== "fixed" ? (
              <ComboboxPrimitive.Trigger
                render={
                  <InputGroupButton
                    aria-label="Change sizing"
                    className="bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    {sizingIcon}
                  </InputGroupButton>
                }
              />
            ) : (
              <PopoverTrigger
                render={
                  <InputGroupButton
                    aria-label={connectorLabel}
                    className="p-0 aspect-square group-data-linked/property-input:bg-accent group-data-linked/property-input:text-accent-foreground group-data-linked/property-input:hover:bg-accent group-data-linked/property-input:hover:text-accent-foreground dark:group-data-linked/property-input:hover:bg-accent dark:group-data-linked/property-input:hover:text-accent-foreground group-data-linked/property-input:aria-expanded:bg-accent group-data-linked/property-input:aria-expanded:text-accent-foreground dark:group-data-linked/property-input:aria-expanded:bg-accent dark:group-data-linked/property-input:aria-expanded:text-accent-foreground"
                  >
                    <PlugIcon />
                  </InputGroupButton>
                }
              />
            )
          }
        />
        <TooltipContent>{connectorLabel}</TooltipContent>
      </Tooltip>
      <span className="sr-only">{connectorLabel}</span>
    </InputGroupAddon>
  );

  const fieldMenu = (
    <ComboboxContent className="p-0.5">
      <ComboboxList>
        {inputType === "color" && (
          <>
            <div className="flex items-center justify-between gap-3 px-2 py-2 text-sm">
              <span>Color</span>
              <input
                aria-label="Choose color"
                className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
                type="color"
                value={getColorInputValue(colorText)}
                onChange={(event) => updateDraftInput(event.target.value)}
              />
            </div>
            <ComboboxSeparator />
          </>
        )}
        {dimension && (
          <>
            <ComboboxGroup>
              <ComboboxItem value="fixed">
                <RulerDimensionLineIcon className={cn(dimension === "height" && "rotate-90")} />
                Fixed {dimension}
              </ComboboxItem>
              <ComboboxItem value="fill">
                {dimension === "width" ? <ChevronsLeftRightIcon /> : <ChevronsUpDownIcon />}
                Fill container
              </ComboboxItem>
              <ComboboxItem value="hug">
                {dimension === "width" ? <ChevronsRightLeftIcon /> : <ChevronsDownUpIcon />}
                Hug contents
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
          <ComboboxItem value="connect">
            <PlugIcon />
            {linkedVariable ? "Change variable…" : "Connect variable…"}
          </ComboboxItem>
        </ComboboxGroup>
      </ComboboxList>
    </ComboboxContent>
  );

  const fieldAddons = (
    <>
      {Icon && (
        <InputGroupAddon
          align="inline-start"
          className={cn(
            "h-full aspect-square p-0 flex items-center justify-center user-select-none",
            inputType === "number" && "cursor-ew-resize",
          )}
        >
          {inputType === "number" ? (
            <span
              role="presentation"
              aria-label="Scrub value"
              className="touch-none select-none"
              onPointerDown={handleScrubPointerDown}
              onPointerMove={handleScrubPointerMove}
              onPointerUp={handleScrubPointerEnd}
              onPointerCancel={handleScrubPointerEnd}
            >
              {renderIcon(Icon)}
            </span>
          ) : (
            renderIcon(Icon)
          )}
        </InputGroupAddon>
      )}
      {inputType === "color" && (
        <InputGroupAddon align="inline-start" className="h-full p-0 pl-1">
          <span
            aria-label={`Color ${colorText || "unset"}`}
            className="size-4 rounded-sm border border-border/70"
            style={{ backgroundColor: getColorInputValue(colorText) }}
          />
        </InputGroupAddon>
      )}
      {linkedVariable && (
        <InputGroupAddon align="inline-start" className="ml-1 max-w-[55%] overflow-hidden">
          <span
            className="inline-flex h-6 min-w-0 items-center truncate rounded bg-background/80 px-1.5 text-xs text-foreground ring-1 ring-border/60"
            data-slot="property-input-chip"
            title={formatValueText(linkedVariable.current, dimension, unit) || undefined}
          >
            {formatValueText(linkedVariable.current, dimension, unit) || "—"}
          </span>
        </InputGroupAddon>
      )}
    </>
  );

  return (
    <Popover open={variablesOpen} onOpenChange={setVariablesOpen}>
      <div
        className="group/property-input w-full min-w-0"
        data-linked={linkedVariable ? true : undefined}
      >
        <Combobox
          value={null}
          inputValue={inputText}
          onValueChange={handleMenuValueChange}
          onOpenChange={(open) => {
            if (!open) commitDraftInput();
          }}
          onInputValueChange={(nextValue, eventDetails) => {
            if (eventDetails.reason === "input-change") {
              updateDraftInput(nextValue);
            }
          }}
        >
          <ComboboxInput
            type="text"
            inputMode={inputType === "number" ? "decimal" : undefined}
            aria-label={placeholder ?? inputType}
            className="w-full min-w-0 bg-muted dark:bg-muted border-0 *:data-[slot=combobox-input]:px-0"
            showTrigger={false}
            onFocus={handleInputFocus}
            onBlur={commitDraftInput}
            onKeyDown={handleInputKeyDown}
          >
            {fieldAddons}
            {connector}
          </ComboboxInput>
          {fieldMenu}
        </Combobox>
      </div>
      <PopoverContent align="end" sideOffset={10} alignOffset={-4} className="p-0 gap-0">
        <InputGroup className="bg-transparent dark:bg-transparent rounded-b-none border-0 border-b border-sidebar-border has-[[data-slot=input-group-control]:focus-visible]:border-sidebar-border has-[[data-slot=input-group-control]:focus-visible]:ring-0">
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Search…"
            aria-label="Search variables"
            value={variableQuery}
            onChange={(event) => setVariableQuery(event.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label="Close variable picker"
              onClick={() => setVariablesOpen(false)}
            >
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <div className="max-h-64 overflow-y-auto p-1">
          {filteredVariables.length > 0 ? (
            filteredVariables.map((variable) => (
              <Button
                key={variable.id}
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => selectVariable(variable)}
              >
                <span className="truncate">{variable.name}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {getValueText(variable.current)}
                </span>
              </Button>
            ))
          ) : (
            <div className="flex w-full justify-center py-4 text-center text-sm text-muted-foreground">
              {variables.length === 0 ? "No variables to connect" : "No matching variables"}
            </div>
          )}
        </div>
        {linkedVariable && (
          <div className="flex border-t border-sidebar-border p-2">
            <Button size="sm" variant="outline" className="grow" onClick={disconnectVariable}>
              Disconnect
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
