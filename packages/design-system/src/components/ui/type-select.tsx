import type { Shape, Type } from "@mechane/domain";
import {
  BoxIcon,
  CalendarClockIcon,
  CalendarIcon,
  ChevronRightIcon,
  HashIcon,
  ImageIcon,
  ListIcon,
  PaletteIcon,
  ToggleLeftIcon,
  TypeIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactElement } from "react";

import { cn } from "../../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSubmenu,
  DropdownMenuSubmenuContent,
  DropdownMenuSubmenuTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";

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
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  triggerClassName?: string;
  triggerSize?: "sm" | "default";
  showLabel?: boolean;
  renderTrigger?(props: TypeSelectTriggerProps): ReactElement;
  optionDisabled?(option: TypeSelectOption): boolean;
};

const PRIMITIVE_OPTIONS: readonly TypeSelectOption[] = [
  { value: "text", label: "Text", icon: TypeIcon },
  { value: "number", label: "Number", icon: HashIcon },
  { value: "boolean", label: "Boolean", icon: ToggleLeftIcon },
  { value: "image", label: "Image", icon: ImageIcon },
  { value: "color", label: "Color", icon: PaletteIcon },
  { value: "date", label: "Date", icon: CalendarIcon },
  { value: "datetime", label: "Date and time", icon: CalendarClockIcon },
];

function optionKey(type: Type): string {
  if (typeof type === "string") return type;
  if (type.kind === "shape") return `shape:${type.shapeId}`;
  return type.kind;
}

function typeLabel(type: Type, shapes: readonly Shape[]): string {
  if (typeof type === "string") {
    return PRIMITIVE_OPTIONS.find((option) => option.value === type)?.label ?? type;
  }
  if (type.kind === "array") return `Array of ${typeLabel(type.of, shapes)}`;
  if (type.kind === "shape")
    return shapes.find((shape) => shape.id === type.shapeId)?.name ?? "Shape";
  return "Object";
}

function typeIcon(type: Type): LucideIcon {
  if (typeof type === "string")
    return PRIMITIVE_OPTIONS.find((option) => option.value === type)?.icon ?? BoxIcon;
  if (type.kind === "array") return ListIcon;
  return BoxIcon;
}

function shapeOptions(shapes: readonly Shape[]): TypeSelectOption[] {
  return [...shapes]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((shape) => ({
      value: { kind: "shape", shapeId: shape.id },
      label: shape.name,
      icon: BoxIcon,
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
  triggerSize = "default",
  showLabel = true,
  renderTrigger,
  optionDisabled,
}: TypeSelectProps) {
  const currentValue = value ?? null;
  const label = currentValue ? typeLabel(currentValue, shapes) : "Choose a Type";
  const Icon = currentValue ? typeIcon(currentValue) : BoxIcon;
  const customTrigger = renderTrigger?.({ value: currentValue, label, icon: Icon });
  const shapeTypeOptions = shapeOptions(shapes);

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
        triggerSize === "sm" ? "h-7 rounded-sm" : "h-8",
        !showLabel && "w-7 justify-center px-1.5",
        triggerClassName,
      )}
    >
      <Icon className="size-4 shrink-0" />
      {showLabel ? <span className="truncate">{label}</span> : null}
      {showLabel ? <ChevronRightIcon className="size-4 rotate-90 text-muted-foreground" /> : null}
    </button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={customTrigger ?? defaultTrigger} />
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Basic Types</DropdownMenuLabel>
          {PRIMITIVE_OPTIONS.map(renderOption)}
        </DropdownMenuGroup>
        {shapeTypeOptions.length > 0 ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Shapes</DropdownMenuLabel>
            {shapeTypeOptions.map(renderOption)}
          </DropdownMenuGroup>
        ) : null}
        {includeArray ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Structured Types</DropdownMenuLabel>
            <DropdownMenuSubmenu>
              <DropdownMenuSubmenuTrigger>Array of…</DropdownMenuSubmenuTrigger>
              <DropdownMenuSubmenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Array item Type</DropdownMenuLabel>
                  {PRIMITIVE_OPTIONS.map((option) =>
                    renderOption({
                      ...option,
                      value: { kind: "array", of: option.value },
                      label: `Array of ${option.label}`,
                      icon: option.icon,
                    }),
                  )}
                  {shapeTypeOptions.map((option) =>
                    renderOption({
                      ...option,
                      value: { kind: "array", of: option.value },
                      label: `Array of ${option.label}`,
                      icon: option.icon,
                    }),
                  )}
                </DropdownMenuGroup>
              </DropdownMenuSubmenuContent>
            </DropdownMenuSubmenu>
          </DropdownMenuGroup>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
