import { isFunction, isObject } from "es-toolkit/compat";
import type { LucideIcon } from "lucide-react";
import type { ShapeValue } from "@mechane/domain";
import type { PointerEventHandler, ReactNode } from "react";

import { InputGroupAddon } from "../input-group";
import { cn } from "../../../lib/utils";
import { formatValueText, getColorInputValue } from "./use-property-input";
import type {
  PropertyInputType,
  PropertyInputUnit,
  VariableReference,
} from "./property-input-types";

function renderIcon(icon: LucideIcon | string) {
  if (isFunction(icon) || isObject(icon)) {
    const Icon = icon as LucideIcon;
    return <Icon aria-hidden="true" className="size-4" />;
  }
  return <span aria-hidden="true">{icon}</span>;
}

export function Addons<T extends ShapeValue>({
  icon,
  inputType,
  colorText,
  linkedVariable,
  dimension,
  unit,
  onScrubPointerDown,
  onScrubPointerMove,
  onScrubPointerEnd,
  connector,
}: {
  icon?: LucideIcon | string;
  inputType: PropertyInputType;
  colorText: string;
  linkedVariable: VariableReference<T> | null;
  dimension?: "width" | "height";
  unit: PropertyInputUnit;
  onScrubPointerDown: PointerEventHandler<HTMLSpanElement>;
  onScrubPointerMove: PointerEventHandler<HTMLSpanElement>;
  onScrubPointerEnd: PointerEventHandler<HTMLSpanElement>;
  connector: ReactNode;
}) {
  return (
    <>
      {icon && (
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
              className="touch-none select-none"
              onPointerDown={onScrubPointerDown}
              onPointerMove={onScrubPointerMove}
              onPointerUp={onScrubPointerEnd}
              onPointerCancel={onScrubPointerEnd}
            >
              {renderIcon(icon)}
            </span>
          ) : (
            renderIcon(icon)
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
      {connector}
    </>
  );
}
