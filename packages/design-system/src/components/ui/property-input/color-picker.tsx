import type { PointerEvent as ReactPointerEvent } from "react";

import { cn } from "../../../lib/utils";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../input-group";
import { NumberInput } from "./number-input";
import { useColorPicker } from "./use-color-picker";
import { colorToCss, HUE_GRADIENT, clamp, parseHexColor } from "./color-utils";

export type { RgbaColor } from "./color-utils";
export { parseHexColor, rgbaToHex } from "./color-utils";

type InlineColorPickerProps = {
  value: string;
  showHex?: boolean;
  onChange: (value: string) => void;
};

const updatePointer = (
  event: ReactPointerEvent<HTMLDivElement>,
  update: (x: number, y: number) => void,
) => {
  const bounds = event.currentTarget.getBoundingClientRect();
  update(
    clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
    clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
  );
};
const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>, update: () => void) => {
  event.currentTarget.setPointerCapture(event.pointerId);
  update();
};

const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>, update: () => void) => {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) update();
};

const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
};

export function InlineColorPicker({ value, showHex = false, onChange }: InlineColorPickerProps) {
  const picker = useColorPicker(value, onChange);

  return (
    <div
      className="w-full space-y-3 p-2"
      role="group"
      aria-label="Color picker"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className="relative h-20 w-full cursor-crosshair touch-none overflow-hidden rounded border border-border"
        aria-label="Saturation and value"
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(picker.hsv.s * 100)}
        aria-valuetext={`Saturation ${Math.round(picker.hsv.s * 100)}%, value ${Math.round(picker.hsv.v * 100)}%`}
        style={{
          backgroundColor: `hsl(${picker.hue} 100% 50%)`,
          backgroundImage:
            "linear-gradient(to top, #000 0%, transparent 100%), linear-gradient(to right, #fff 0%, transparent 100%)",
        }}
        onPointerDown={(event) =>
          handlePointerDown(event, () =>
            updatePointer(event, (x, y) => picker.updateSaturationValue(x, 1 - y)),
          )
        }
        onPointerMove={(event) =>
          handlePointerMove(event, () =>
            updatePointer(event, (x, y) => picker.updateSaturationValue(x, 1 - y)),
          )
        }
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.1 : 0.01;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            picker.updateSaturationValue(
              clamp(picker.hsv.s + (event.key === "ArrowRight" ? step : -step), 0, 1),
              picker.hsv.v,
            );
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            picker.updateSaturationValue(
              picker.hsv.s,
              clamp(picker.hsv.v + (event.key === "ArrowUp" ? step : -step), 0, 1),
            );
          }
        }}
      >
        <span
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.65)]"
          style={{ left: `${picker.hsv.s * 100}%`, top: `${(1 - picker.hsv.v) * 100}%` }}
        />
      </div>
      <div
        className="relative h-3 w-full cursor-pointer touch-none rounded border border-border"
        aria-label="Hue"
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(picker.hue)}
        style={{ background: HUE_GRADIENT }}
        onPointerDown={(event) =>
          handlePointerDown(event, () => updatePointer(event, (x) => picker.updateHue(x * 360)))
        }
        onPointerMove={(event) =>
          handlePointerMove(event, () => updatePointer(event, (x) => picker.updateHue(x * 360)))
        }
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            picker.updateHue(picker.hue + (event.key === "ArrowRight" ? 1 : -1));
          }
        }}
      >
        <span
          className="pointer-events-none absolute left-0 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.65)]"
          style={{ left: `${(picker.hue / 360) * 100}%` }}
        />
      </div>
      <div
        className="relative h-3 w-full cursor-pointer touch-none rounded border border-border"
        aria-label="Opacity"
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(picker.color.a * 100)}
        style={{
          backgroundImage: `linear-gradient(to right, transparent, ${colorToCss({ ...picker.color, a: 1 })}), linear-gradient(45deg, rgb(128 128 128 / 0.3) 25%, transparent 25%), linear-gradient(-45deg, rgb(128 128 128 / 0.3) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgb(128 128 128 / 0.3) 75%), linear-gradient(-45deg, transparent 75%, rgb(128 128 128 / 0.3) 75%)`,
          backgroundPosition: "0 0, 0 0, 0 4px, 4px -4px, -4px 0",
          backgroundSize: "auto, 8px 8px, 8px 8px, 8px 8px, 8px 8px",
        }}
        onPointerDown={(event) =>
          handlePointerDown(event, () => updatePointer(event, (x) => picker.updateOpacity(x)))
        }
        onPointerMove={(event) =>
          handlePointerMove(event, () => updatePointer(event, (x) => picker.updateOpacity(x)))
        }
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            const step = event.shiftKey ? 0.1 : 0.01;
            picker.updateOpacity(picker.color.a + (event.key === "ArrowRight" ? step : -step));
          }
        }}
      >
        <span
          className="pointer-events-none absolute left-0 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.65)]"
          style={{ left: `${picker.color.a * 100}%` }}
        />
      </div>
      <div className="grid grid-cols-4 gap-px">
        <NumberInput
          label="R"
          value={Math.round(picker.color.r)}
          min={0}
          max={255}
          onChange={(next) => picker.updateRgb("r", next)}
        />
        <NumberInput
          label="G"
          value={Math.round(picker.color.g)}
          min={0}
          max={255}
          onChange={(next) => picker.updateRgb("g", next)}
        />
        <NumberInput
          label="B"
          value={Math.round(picker.color.b)}
          min={0}
          max={255}
          onChange={(next) => picker.updateRgb("b", next)}
        />
        <NumberInput
          label="A"
          value={Math.round(picker.color.a * 100)}
          min={0}
          max={100}
          onChange={(next) => picker.emitColor({ ...picker.color, a: next / 100 })}
        />
      </div>
      {showHex && (
        <InputGroup
          className={cn(
            "h-6 bg-muted border-transparent text-xs rounded-sm",
            !parseHexColor(picker.hexDraft) && "border-destructive",
          )}
        >
          <InputGroupAddon align="inline-start">Hex</InputGroupAddon>
          <InputGroupInput
            aria-label="Hex color"
            className="px-1 text-xs text-foreground outline-none"
            value={picker.hexDraft}
            onChange={(event) => picker.updateHexDraft(event.target.value)}
            onBlur={picker.commitHexDraft}
          />
        </InputGroup>
      )}
    </div>
  );
}
