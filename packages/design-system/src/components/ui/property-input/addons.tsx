import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import type { ShapeValue } from "@mechane/domain/shapes";
import { isFunction, isObject } from "es-toolkit/compat";
import type { LucideIcon } from "lucide-react";
import type { PointerEventHandler, ReactNode } from "react";

import { cn } from "../../../lib/utils";
import { InputGroupAddon, InputGroupButton } from "../input-group";
import type { PropertyInputType, VariableReference } from "./property-input-types";
import { getColorInputValue } from "./use-property-input";
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
  onScrubPointerDown,
  onScrubPointerMove,
  onScrubPointerEnd,
  connector,
  actions,
}: {
  icon?: LucideIcon | string;
  inputType: PropertyInputType;
  colorText: string;
  linkedVariable: VariableReference<T> | null;
  onScrubPointerDown: PointerEventHandler<HTMLDivElement>;
  onScrubPointerMove?: PointerEventHandler<HTMLDivElement>;
  onScrubPointerEnd?: PointerEventHandler<HTMLDivElement>;
  /** The trailing button, or nothing when the Property has no menu to offer. */
  connector: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <>
      {icon && (
        <InputGroupAddon
          align="inline-start"
          className={cn(
            "h-full aspect-square p-0 flex items-center justify-center select-none",
            inputType === "number" && "touch-none cursor-ew-resize",
          )}
          onPointerDown={inputType === "number" ? onScrubPointerDown : undefined}
          onPointerMove={inputType === "number" ? onScrubPointerMove : undefined}
          onPointerUp={inputType === "number" ? onScrubPointerEnd : undefined}
          onPointerCancel={inputType === "number" ? onScrubPointerEnd : undefined}
          onLostPointerCapture={inputType === "number" ? onScrubPointerEnd : undefined}
        >
          {renderIcon(icon)}
        </InputGroupAddon>
      )}
      {inputType === "color" && (
        <InputGroupAddon align="inline-start" className="h-full p-0 has-[>button]:ml-1.5 mr-1">
          <ComboboxPrimitive.Trigger
            render={
              <InputGroupButton
                aria-label={`Color ${colorText || "unset"}`}
                variant="ghost"
                size="icon-xs"
                className="size-5 cursor-pointer rounded-sm border border-border p-0 hover:bg-transparent"
                style={{ backgroundColor: getColorInputValue(colorText) }}
              />
            }
          />
        </InputGroupAddon>
      )}
      {linkedVariable && (
        <InputGroupAddon align="inline-start" className="ml-1 max-w-[55%] pl-0 overflow-hidden">
          <span
            className="inline-flex h-6 min-w-0 items-center truncate rounded bg-background/80 px-1.5 text-xs text-foreground ring-1 ring-border/60"
            data-slot="property-input-chip"
            title={linkedVariable.name}
          >
            {linkedVariable.name}
          </span>
        </InputGroupAddon>
      )}
      {connector}
      {actions ? (
        <InputGroupAddon align="inline-end" className="h-full gap-0 pr-1 has-[>button]:mr-0">
          {actions}
        </InputGroupAddon>
      ) : null}
    </>
  );
}
