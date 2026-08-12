import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";

import { cn } from "../../../lib/utils";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../input-group";

export type RgbaColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

type HsvColor = {
  h: number;
  s: number;
  v: number;
};

const HUE_GRADIENT =
  "linear-gradient(to right, #ff0000 0%, #ffff00 16.66%, #00ff00 33.33%, #00ffff 50%, #0000ff 66.66%, #ff00ff 83.33%, #ff0000 100%)";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const channelToHex = (channel: number) =>
  Math.round(clamp(channel, 0, 255))
    .toString(16)
    .padStart(2, "0");

const alphaToHex = (alpha: number) => channelToHex(clamp(alpha, 0, 1) * 255);
const isCompleteHex = (value: string) => /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim());
export const parseHexColor = (value: string): RgbaColor | null => {
  const hex = value.trim().replace(/^#/, "");
  if (![3, 4, 6, 8].includes(hex.length) || !/^[0-9a-f]+$/i.test(hex)) return null;

  const expanded =
    hex.length <= 4
      ? hex
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : hex;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
    a: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
  };
};

export const rgbaToHex = ({ r, g, b, a }: RgbaColor): string => {
  const channels = `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
  return a >= 1 ? channels : `${channels}${alphaToHex(a)}`;
};

const colorToHsv = ({ r, g, b }: RgbaColor): HsvColor => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === red) h = 60 * (((green - blue) / delta) % 6);
    else if (max === green) h = 60 * ((blue - red) / delta + 2);
    else h = 60 * ((red - green) / delta + 4);
  }

  return {
    h: h < 0 ? h + 360 : h,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
};

const hsvToColor = ({ h, s, v }: HsvColor, alpha: number): RgbaColor => {
  const hue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const match = v - chroma;
  const [red, green, blue] =
    segment < 1
      ? [chroma, x, 0]
      : segment < 2
        ? [x, chroma, 0]
        : segment < 3
          ? [0, chroma, x]
          : segment < 4
            ? [0, x, chroma]
            : segment < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];

  return {
    r: (red + match) * 255,
    g: (green + match) * 255,
    b: (blue + match) * 255,
    a: alpha,
  };
};

const normalizeColor = (value: string) =>
  rgbaToHex(parseHexColor(value) ?? { r: 0, g: 0, b: 0, a: 1 });

const colorToCss = ({ r, g, b, a }: RgbaColor) => `rgba(${r}, ${g}, ${b}, ${a})`;

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

const NumberInput = ({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) => (
  <InputGroup className="text-xs p-0 border-transparent bg-muted h-6 rounded-sm not-first:rounded-l-none not-last:rounded-r-none has-[[data-slot=input-group-control]:focus-visible]:ring-0">
    <InputGroupAddon align="inline-start">{label}</InputGroupAddon>
    <InputGroupInput
      aria-label={label}
      className="h-6 min-w-0 p-1 appearance-none rounded text-xs outline-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
      min={min}
      max={max}
      step={step}
      onFocus={(event) => event.currentTarget.select()}
      value={value}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(clamp(next, min, max));
      }}
    />
  </InputGroup>
);

type InlineColorPickerProps = {
  value: string;
  showHex?: boolean;
  onChange: (value: string) => void;
};

export function InlineColorPicker({ value, showHex = false, onChange }: InlineColorPickerProps) {
  const normalizedValue = normalizeColor(value);
  const [color, setColor] = useState<RgbaColor>(
    () => parseHexColor(normalizedValue) ?? { r: 0, g: 0, b: 0, a: 1 },
  );
  const [hue, setHue] = useState(() => colorToHsv(color).h);
  const [hexDraft, setHexDraft] = useState(normalizedValue);
  const hsv = colorToHsv(color);

  useEffect(() => {
    const next = parseHexColor(normalizedValue) ?? { r: 0, g: 0, b: 0, a: 1 };
    setColor(next);
    setHue(colorToHsv(next).h);
    setHexDraft(normalizedValue);
  }, [normalizedValue]);

  const emitColor = (next: RgbaColor) => {
    setColor(next);
    setHexDraft(rgbaToHex(next));
    onChange(rgbaToHex(next));
  };

  const updateHue = (nextHue: number) => {
    const next = hsvToColor({ h: nextHue, s: hsv.s, v: hsv.v }, color.a);
    setHue(nextHue);
    emitColor(next);
  };

  const updateOpacity = (nextOpacity: number) => {
    emitColor({ ...color, a: clamp(nextOpacity, 0, 1) });
  };

  const updateSaturationValue = (s: number, v: number) => {
    emitColor(hsvToColor({ h: hue, s, v }, color.a));
  };

  const updateRgb = (channel: "r" | "g" | "b", nextValue: number) => {
    const next = { ...color, [channel]: nextValue };
    const nextHsv = colorToHsv(next);
    if (nextHsv.s > 0) setHue(nextHsv.h);
    emitColor(next);
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
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, value ${Math.round(hsv.v * 100)}%`}
        style={{
          backgroundColor: `hsl(${hue} 100% 50%)`,
          backgroundImage:
            "linear-gradient(to top, #000 0%, transparent 100%), linear-gradient(to right, #fff 0%, transparent 100%)",
        }}
        onPointerDown={(event) =>
          handlePointerDown(event, () =>
            updatePointer(event, (x, y) => updateSaturationValue(x, 1 - y)),
          )
        }
        onPointerMove={(event) =>
          handlePointerMove(event, () =>
            updatePointer(event, (x, y) => updateSaturationValue(x, 1 - y)),
          )
        }
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.1 : 0.01;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            updateSaturationValue(
              clamp(hsv.s + (event.key === "ArrowRight" ? step : -step), 0, 1),
              hsv.v,
            );
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            updateSaturationValue(
              hsv.s,
              clamp(hsv.v + (event.key === "ArrowUp" ? step : -step), 0, 1),
            );
          }
        }}
      >
        <span
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.65)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>

      <div
        className="relative h-3 w-full cursor-pointer touch-none rounded border border-border"
        aria-label="Hue"
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hue)}
        style={{ background: HUE_GRADIENT }}
        onPointerDown={(event) =>
          handlePointerDown(event, () => updatePointer(event, (x) => updateHue(x * 360)))
        }
        onPointerMove={(event) =>
          handlePointerMove(event, () => updatePointer(event, (x) => updateHue(x * 360)))
        }
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            updateHue(hue + (event.key === "ArrowRight" ? 1 : -1));
          }
        }}
      >
        <span
          className="pointer-events-none absolute left-0 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.65)]"
          style={{ left: `${(hue / 360) * 100}%` }}
        />
      </div>

      <div
        className="relative h-3 w-full cursor-pointer touch-none rounded border border-border"
        aria-label="Opacity"
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(color.a * 100)}
        style={{
          backgroundImage: `linear-gradient(to right, transparent, ${colorToCss({ ...color, a: 1 })}), linear-gradient(45deg, rgb(128 128 128 / 0.3) 25%, transparent 25%), linear-gradient(-45deg, rgb(128 128 128 / 0.3) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgb(128 128 128 / 0.3) 75%), linear-gradient(-45deg, transparent 75%, rgb(128 128 128 / 0.3) 75%)`,
          backgroundPosition: "0 0, 0 0, 0 4px, 4px -4px, -4px 0",
          backgroundSize: "auto, 8px 8px, 8px 8px, 8px 8px, 8px 8px",
        }}
        onPointerDown={(event) =>
          handlePointerDown(event, () => updatePointer(event, (x) => updateOpacity(x)))
        }
        onPointerMove={(event) =>
          handlePointerMove(event, () => updatePointer(event, (x) => updateOpacity(x)))
        }
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            const step = event.shiftKey ? 0.1 : 0.01;
            updateOpacity(color.a + (event.key === "ArrowRight" ? step : -step));
          }
        }}
      >
        <span
          className="pointer-events-none absolute left-0 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.65)]"
          style={{ left: `${color.a * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-4 gap-px">
        <NumberInput
          label="R"
          value={Math.round(color.r)}
          min={0}
          max={255}
          onChange={(next) => updateRgb("r", next)}
        />
        <NumberInput
          label="G"
          value={Math.round(color.g)}
          min={0}
          max={255}
          onChange={(next) => updateRgb("g", next)}
        />
        <NumberInput
          label="B"
          value={Math.round(color.b)}
          min={0}
          max={255}
          onChange={(next) => updateRgb("b", next)}
        />
        <NumberInput
          label="A"
          value={Math.round(color.a * 100)}
          min={0}
          max={100}
          onChange={(next) => emitColor({ ...color, a: next / 100 })}
        />
      </div>
      {showHex && (
        <InputGroup
          className={cn(
            "h-6 bg-muted border-transparent text-xs rounded-sm",
            !parseHexColor(hexDraft) && "border-destructive",
          )}
        >
          <InputGroupAddon align="inline-start">Hex</InputGroupAddon>
          <InputGroupInput
            aria-label="Hex color"
            className={cn("px-1 text-xs text-foreground outline-none")}
            value={hexDraft}
            onChange={(event) => {
              const nextValue = event.target.value;
              setHexDraft(nextValue);
              const next = parseHexColor(nextValue);
              if (next && isCompleteHex(nextValue)) {
                const nextHsv = colorToHsv(next);
                if (nextHsv.s > 0) setHue(nextHsv.h);
                emitColor(next);
              }
            }}
            onBlur={() => {
              const next = parseHexColor(hexDraft);
              if (next) emitColor(next);
              else setHexDraft(rgbaToHex(color));
            }}
          />
        </InputGroup>
      )}
    </div>
  );
}
