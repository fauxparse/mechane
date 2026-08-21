import type { Shape, Type } from "@mechane/domain";
import {
  BoxIcon,
  CalendarClockIcon,
  CalendarIcon,
  HashIcon,
  ImageIcon,
  ListIcon,
  PaletteIcon,
  ToggleLeftIcon,
  TypeIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "./select";

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
  includeObject?: boolean;
  includeArray?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  triggerClassName?: string;
  triggerSize?: "sm" | "default";
  showLabel?: boolean;
  renderTrigger?(props: TypeSelectTriggerProps): ReactElement;
  optionDisabled?(option: TypeSelectOption): boolean;
  children?: ReactNode;
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

const OBJECT_OPTION: TypeSelectOption = { value: { kind: "object" }, label: "Object", icon: BoxIcon };
const ARRAY_OPTION: TypeSelectOption = { value: { kind: "array", of: "text" }, label: "Array", icon: ListIcon };

function optionKey(type: Type): string {
  if (typeof type === "string") return type;
  if (type.kind === "shape") return `shape:${type.shapeId}`;
  return type.kind;
}

function typeLabel(type: Type, shapes: readonly Shape[]): string {
  if (typeof type === "string") {
    return PRIMITIVE_OPTIONS.find((option) => option.value === type)?.label ?? type;
  }
  if (type.kind === "array") return "Array";
  if (type.kind === "object") return "Object";
  return shapes.find((shape) => shape.id === type.shapeId)?.name ?? "Shape";
}

function typeIcon(type: Type): LucideIcon {
  if (typeof type === "string") {
    return PRIMITIVE_OPTIONS.find((option) => option.value === type)?.icon ?? BoxIcon;
  }
  if (type.kind === "array") return ListIcon;
  return BoxIcon;
}

function optionsFor({ shapes = [], includeObject = true, includeArray = true }: Pick<TypeSelectProps, "shapes" | "includeObject" | "includeArray">): { primitives: TypeSelectOption[]; shapes: TypeSelectOption[]; composed: TypeSelectOption[] } {
  return {
    primitives: [...PRIMITIVE_OPTIONS],
    shapes: shapes.map((shape) => ({ value: { kind: "shape", shapeId: shape.id }, label: shape.name, icon: BoxIcon })),
    composed: [
      ...(includeObject ? [OBJECT_OPTION] : []),
      ...(includeArray ? [ARRAY_OPTION] : []),
    ],
  };
}

export function TypeSelect({
  value,
  onValueChange,
  shapes,
  includeObject = true,
  includeArray = true,
  disabled = false,
  "aria-label": ariaLabel = "Type",
  "aria-invalid": ariaInvalid,
  triggerClassName,
  triggerSize = "default",
  showLabel = true,
  renderTrigger,
  optionDisabled,
  children,
}: TypeSelectProps) {
  const currentValue = value ?? null;
  const key = currentValue ? optionKey(currentValue) : "";
  const label = currentValue ? typeLabel(currentValue, shapes ?? []) : "Choose a Type";
  const Icon = currentValue ? typeIcon(currentValue) : BoxIcon;
  const options = optionsFor({ shapes, includeObject, includeArray });
  const customTrigger = renderTrigger?.({ value: currentValue, label, icon: Icon });

  function renderOption(option: TypeSelectOption) {
    const disabledOption = disabled || option.disabled || optionDisabled?.(option) === true;
    const OptionIcon = option.icon;
    return (
      <SelectItem key={optionKey(option.value)} value={optionKey(option.value)} disabled={disabledOption}>
        <OptionIcon className="size-4 text-muted-foreground" />
        {option.label}
      </SelectItem>
    );
  }

  return (
    <Select
      value={key}
      onValueChange={(next) => {
        if (!next) return;
        const selected = [...options.primitives, ...options.shapes, ...options.composed].find(
          (option) => optionKey(option.value) === next,
        );
        if (selected) onValueChange(selected.value);
      }}
      disabled={disabled}
      items={[...options.primitives, ...options.shapes, ...options.composed].map((option) => ({
        value: optionKey(option.value),
        label: option.label,
      }))}
      modal={false}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        size={triggerSize}
        aria-invalid={ariaInvalid}
        render={customTrigger}
      >
        <SelectValue>
          <Icon className="size-4 shrink-0" />
          {showLabel ? <span className="truncate">{label}</span> : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Basic Types</SelectLabel>
          {options.primitives.map(renderOption)}
        </SelectGroup>
        {options.shapes.length > 0 ? (
          <SelectGroup>
            <SelectLabel>Shapes</SelectLabel>
            {options.shapes.map(renderOption)}
          </SelectGroup>
        ) : null}
        {options.composed.length > 0 ? (
          <SelectGroup>
            <SelectLabel>Structured Types</SelectLabel>
            {options.composed.map(renderOption)}
          </SelectGroup>
        ) : null}
        {children}
      </SelectContent>
    </Select>
  );
}
