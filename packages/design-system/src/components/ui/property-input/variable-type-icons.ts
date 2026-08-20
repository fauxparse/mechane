import type { ShapeValue } from "@mechane/domain";
import {
  Box,
  Calendar,
  CalendarClock,
  Hash,
  List,
  PaletteIcon,
  ToggleLeft,
  Type,
  type LucideIcon,
} from "lucide-react";

/**
 * Icons for variable (and Source) data types. The icon is doing the work a
 * hue would otherwise do — identity by type, not by chrome.
 */
export const VARIABLE_TYPE_ICONS = {
  text: Type,
  number: Hash,
  boolean: ToggleLeft,
  object: Box,
  array: List,
  image: Box,
  color: PaletteIcon,
  date: Calendar,
  datetime: CalendarClock,
} as const satisfies Record<ShapeValue["kind"], LucideIcon>;

export function variableTypeIcon(type: ShapeValue["kind"] | undefined): LucideIcon {
  return VARIABLE_TYPE_ICONS[type ?? "object"] ?? Box;
}
