import { typeLabel, type ShapeValue, type Type } from "@mechane/domain/shapes";
import { upperFirst } from "es-toolkit";
import {
  CalendarClockIcon,
  CalendarIcon,
  HashIcon,
  ImageIcon,
  ListIcon,
  PaletteIcon,
  PuzzleIcon,
  ToggleLeftIcon,
  TypeIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * Icons for variable (and Source) data types. The icon is doing the work a
 * hue would otherwise do — identity by type, not by chrome.
 */
export const VARIABLE_TYPE_ICONS = {
  text: TypeIcon,
  number: HashIcon,
  boolean: ToggleLeftIcon,
  object: PuzzleIcon,
  array: ListIcon,
  image: ImageIcon,
  color: PaletteIcon,
  date: CalendarIcon,
  datetime: CalendarClockIcon,
} as const satisfies Record<ShapeValue["kind"] | "object", LucideIcon>;

export type VariableTypeIconKind = keyof typeof VARIABLE_TYPE_ICONS;

function isVariableTypeIconKind(kind: string): kind is VariableTypeIconKind {
  return Object.hasOwn(VARIABLE_TYPE_ICONS, kind);
}

/** Icon-map key for a Type, GraphQL-shaped `{ kind }`, or ShapeValue kind. */
export function variableTypeKind(
  type: Type | ShapeValue["kind"] | { kind: string } | string | null | undefined,
): VariableTypeIconKind {
  if (type == null) return "object";
  if (typeof type === "string") return isVariableTypeIconKind(type) ? type : "object";
  if (type.kind === "array") return "array";
  if (type.kind === "shape") return "object";
  return isVariableTypeIconKind(type.kind) ? type.kind : "object";
}

export function variableTypeIcon(
  type: Type | ShapeValue["kind"] | "object" | null | undefined,
): LucideIcon {
  return VARIABLE_TYPE_ICONS[variableTypeKind(type)];
}

export function variableTypeLabel(type: Type | ShapeValue["kind"] | null | undefined): string {
  if (typeof type === "string") return type === "array" ? "Array" : typeLabel(type);
  switch (variableTypeKind(type)) {
    case "object":
      return "Object";
    default:
      return upperFirst(variableTypeKind(type));
  }
}
