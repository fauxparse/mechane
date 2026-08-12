import { useEffect, useState } from "react";

import {
  clamp,
  colorToHsv,
  hsvToColor,
  isCompleteHex,
  normalizeColor,
  parseHexColor,
  rgbaToHex,
  type RgbaColor,
} from "./color-utils";

export function useColorPicker(value: string, onChange: (value: string) => void) {
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
    const nextHex = rgbaToHex(next);
    setColor(next);
    setHexDraft(nextHex);
    onChange(nextHex);
  };
  const updateHue = (nextHue: number) => {
    setHue(nextHue);
    emitColor(hsvToColor({ h: nextHue, s: hsv.s, v: hsv.v }, color.a));
  };
  const updateOpacity = (nextOpacity: number) =>
    emitColor({ ...color, a: clamp(nextOpacity, 0, 1) });
  const updateSaturationValue = (s: number, v: number) =>
    emitColor(hsvToColor({ h: hue, s, v }, color.a));
  const updateRgb = (channel: "r" | "g" | "b", nextValue: number) => {
    const next = { ...color, [channel]: nextValue };
    const nextHsv = colorToHsv(next);
    if (nextHsv.s > 0) setHue(nextHsv.h);
    emitColor(next);
  };
  const updateHexDraft = (nextValue: string) => {
    setHexDraft(nextValue);
    const next = parseHexColor(nextValue);
    if (next && isCompleteHex(nextValue)) {
      const nextHsv = colorToHsv(next);
      if (nextHsv.s > 0) setHue(nextHsv.h);
      emitColor(next);
    }
  };
  const commitHexDraft = () => {
    const next = parseHexColor(hexDraft);
    if (next) emitColor(next);
    else setHexDraft(rgbaToHex(color));
  };

  return {
    color,
    hue,
    hsv,
    hexDraft,
    emitColor,
    updateHue,
    updateOpacity,
    updateSaturationValue,
    updateRgb,
    updateHexDraft,
    commitHexDraft,
  };
}
