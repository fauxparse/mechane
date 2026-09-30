import type { ShapeValue, Type } from "@mechane/domain/shapes";
import type { LucideProps } from "lucide-react";

import { cn } from "../../../lib/utils";
import { BadgedIcon } from "../badged-icon";
import { VARIABLE_TYPE_ICONS, variableTypeIcon } from "./variable-type-icons";

// `Omit` because SVG attributes already declare a string `type`.
export type VariableTypeIconProps = Omit<LucideProps, "type"> & {
  type: Type | ShapeValue["kind"] | "object" | null | undefined;
};

/**
 * The icon for a data type. An array shows the array icon badged with its
 * element type's icon, so "Array of Text" and "Array of Person" read apart.
 */
export function VariableTypeIcon({ type, className, ...props }: VariableTypeIconProps) {
  if (type != null && typeof type === "object" && type.kind === "array") {
    return (
      <BadgedIcon
        icon={VARIABLE_TYPE_ICONS.array}
        badge={variableTypeIcon(type.of)}
        // Inherit colour like the plain icons beside it, unless the caller sets one.
        className={cn("text-current", className)}
        {...props}
      />
    );
  }
  const Icon = variableTypeIcon(type);
  return <Icon className={className} {...props} />;
}
