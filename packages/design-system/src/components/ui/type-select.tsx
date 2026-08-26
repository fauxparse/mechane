import { PRIMITIVE_TYPES, type Shape, type Type } from "@mechane/domain";
import { CheckIcon, ChevronRightIcon, type LucideIcon } from "lucide-react";
import type { ReactElement } from "react";

import { cn } from "../../lib/utils";
import { useVibe, type Vibe } from "../inspector-vibe";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSubmenu,
  DropdownMenuSubmenuContent,
  DropdownMenuSubmenuTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { variableTypeIcon, variableTypeLabel } from "./property-input/variable-type-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";
export type TypeSelectOption = {
  value: Type;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
};

export type TypeSelectTriggerProps = {
  value: Type | null;
  label: string;
  icon: LucideIcon;
};
export type TypeSelectProps = {
  value: Type | null | undefined;
  onValueChange(value: Type): void;
  shapes?: readonly Shape[];
  includeArray?: boolean;
  disabled?: boolean;
  vibe?: Vibe;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  triggerClassName?: string;
  triggerSize?: "sm" | "default";
  showLabel?: boolean;
  renderTrigger?(props: TypeSelectTriggerProps): ReactElement;
  optionDisabled?(option: TypeSelectOption): boolean;
};

const PRIMITIVE_OPTIONS: readonly TypeSelectOption[] = PRIMITIVE_TYPES.map((value) => ({
  value,
  label: variableTypeLabel(value),
  icon: variableTypeIcon(value),
}));

function optionKey(type: Type): string {
  if (typeof type === "string") return type;
  if (type.kind === "array") return `array:${optionKey(type.of)}`;
  return `shape:${type.shapeId}`;
}

function typesEqual(left: Type | null, right: Type): boolean {
  if (left === null) return false;
  if (typeof left === "string" || typeof right === "string") return left === right;
  if (left.kind !== right.kind) return false;
  if (left.kind === "array" && right.kind === "array") return typesEqual(left.of, right.of);
  if (left.kind === "shape" && right.kind === "shape") return left.shapeId === right.shapeId;
  return true;
}

function typeLabel(type: Type, shapes: readonly Shape[]): string {
  if (typeof type === "string") return variableTypeLabel(type);
  if (type.kind === "array") return `Array of ${typeLabel(type.of, shapes)}`;
  return shapes.find((shape) => shape.id === type.shapeId)?.name ?? "Shape";
}

function typeIcon(type: Type): LucideIcon {
  return variableTypeIcon(type);
}

function shapeOptions(shapes: readonly Shape[]): TypeSelectOption[] {
  return [...shapes]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((shape) => ({
      value: { kind: "shape", shapeId: shape.id },
      label: shape.name,
      icon: variableTypeIcon({ kind: "shape", shapeId: shape.id }),
    }));
}

export function TypeSelect({
  value,
  onValueChange,
  shapes = [],
  includeArray = true,
  disabled = false,
  "aria-label": ariaLabel = "Type",
  "aria-invalid": ariaInvalid,
  triggerClassName,
  triggerSize,
  vibe: vibeProp,
  showLabel = true,
  renderTrigger,
  optionDisabled,
}: TypeSelectProps) {
  const vibe = useVibe(vibeProp);
  const resolvedTriggerSize = triggerSize ?? (vibe === "inspector" ? "sm" : "default");
  const currentValue = value ?? null;
  const label = currentValue ? typeLabel(currentValue, shapes) : "Choose a Type";
  const Icon = currentValue ? typeIcon(currentValue) : variableTypeIcon("object");
  const customTrigger = renderTrigger?.({ value: currentValue, label, icon: Icon });
  const shapeTypeOptions = shapeOptions(shapes);
  const ArrayIcon = variableTypeIcon("array");

  const isDisabled = (option: TypeSelectOption) =>
    disabled || option.disabled === true || optionDisabled?.(option) === true;
  const selectType = (next: Type) => {
    const option = { value: next, label: typeLabel(next, shapes), icon: typeIcon(next) };
    if (!isDisabled(option)) onValueChange(next);
  };
  const renderOption = (option: TypeSelectOption) => {
    const OptionIcon = option.icon;
    return (
      <DropdownMenuItem
        key={optionKey(option.value)}
        disabled={isDisabled(option)}
        onClick={() => selectType(option.value)}
      >
        <OptionIcon className="size-4 text-muted-foreground" />
        {option.label}
        <CheckIcon
          className={cn(
            "ml-auto size-4",
            typesEqual(currentValue, option.value) ? "opacity-100" : "opacity-0",
          )}
          aria-hidden="true"
        />
      </DropdownMenuItem>
    );
  };

  const defaultTrigger = (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid}
      disabled={disabled}
      className={cn(
        "flex min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        resolvedTriggerSize === "sm" ? "h-7 rounded-sm" : "h-8",
        vibe === "inspector" && "w-full border-0 bg-muted/50 px-2 dark:bg-muted/50",
        !showLabel && "w-7 justify-center px-1.5",
        triggerClassName,
      )}
    >
      <Icon className="size-4 shrink-0" />
      {showLabel ? <span className="flex-1 text-left truncate">{label}</span> : null}
      {showLabel ? <ChevronRightIcon className="size-4 rotate-90 text-muted-foreground" /> : null}
    </button>
  );
  return (
    <Tooltip>
      <DropdownMenu>
        <TooltipTrigger
          render={<DropdownMenuTrigger render={customTrigger ?? defaultTrigger} />}
        ></TooltipTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            {PRIMITIVE_OPTIONS.map(renderOption)}
            {includeArray ? (
              <DropdownMenuSubmenu>
                <DropdownMenuSubmenuTrigger>
                  <ArrayIcon className="size-4 text-muted-foreground" />
                  <span>Array of…</span>
                </DropdownMenuSubmenuTrigger>
                <DropdownMenuSubmenuContent>
                  <DropdownMenuGroup>
                    {PRIMITIVE_OPTIONS.map((option) =>
                      renderOption({
                        ...option,
                        value: { kind: "array", of: option.value },
                        icon: option.icon,
                      }),
                    )}
                  </DropdownMenuGroup>
                  {shapeTypeOptions.length > 0 ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        {shapeTypeOptions.map((option) =>
                          renderOption({
                            ...option,
                            value: { kind: "array", of: option.value },
                            icon: option.icon,
                          }),
                        )}
                      </DropdownMenuGroup>
                    </>
                  ) : null}
                </DropdownMenuSubmenuContent>
              </DropdownMenuSubmenu>
            ) : null}
          </DropdownMenuGroup>
          {shapeTypeOptions.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>{shapeTypeOptions.map(renderOption)}</DropdownMenuGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
