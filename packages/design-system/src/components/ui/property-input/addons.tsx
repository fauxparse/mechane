import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { isFunction, isObject } from "es-toolkit/compat";
import type { LucideIcon } from "lucide-react";
import type { PointerEventHandler, ReactNode } from "react";

import { cn } from "../../../lib/utils";
import { InputGroupAddon } from "../input-group";
import { getColorInputValue } from "./use-property-input";

function renderIcon(icon: LucideIcon | string) {
  if (isFunction(icon) || isObject(icon)) {
    const Icon = icon as LucideIcon;
    return <Icon aria-hidden="true" className="size-4" />;
  }
  return <span aria-hidden="true">{icon}</span>;
}

export function Addons({
  icon,
  swatch,
  onScrubPointerDown,
  onScrubPointerMove,
  onScrubPointerEnd,
  actions,
}: {
  icon?: LucideIcon | string;
  /** A literal Color's swatch, which opens the color picker. */
  swatch: { readonly colorText: string; readonly disabled: boolean } | null;
  /** Dragging the label scrubs the value; absent when the row cannot be scrubbed. */
  onScrubPointerDown?: PointerEventHandler<HTMLDivElement>;
  onScrubPointerMove?: PointerEventHandler<HTMLDivElement>;
  onScrubPointerEnd?: PointerEventHandler<HTMLDivElement>;
  actions?: ReactNode;
}) {
  return (
    <>
      {icon && (
        <InputGroupAddon
          align="inline-start"
          className={cn(
            "h-full w-6 shrink-0 justify-center p-0",
            onScrubPointerDown && "touch-none cursor-ew-resize",
          )}
          onPointerDown={onScrubPointerDown}
          onPointerMove={onScrubPointerMove}
          onPointerUp={onScrubPointerEnd}
          onPointerCancel={onScrubPointerEnd}
          onLostPointerCapture={onScrubPointerEnd}
        >
          {renderIcon(icon)}
        </InputGroupAddon>
      )}
      {swatch && (
        <InputGroupAddon align="inline-start" className="h-full p-0 pl-1 has-[>button]:ml-0">
          <ComboboxPrimitive.Trigger
            aria-label={`Color ${swatch.colorText || "unset"}`}
            disabled={swatch.disabled}
            className="size-4 cursor-pointer rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed"
            style={{ backgroundColor: getColorInputValue(swatch.colorText) }}
          />
        </InputGroupAddon>
      )}
      {actions ? (
        <InputGroupAddon align="inline-end" className="h-full gap-0 pr-1 has-[>button]:mr-0">
          {actions}
        </InputGroupAddon>
      ) : null}
    </>
  );
}
