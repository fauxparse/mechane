export type RgbaColor = { r: number; g: number; b: number; a: number };
export type HsvColor = { h: number; s: number; v: number };

export const HUE_GRADIENT =
  "linear-gradient(to right, #ff0000 0%, #ffff00 16.66%, #00ff00 33.33%, #00ffff 50%, #0000ff 66.66%, #ff00ff 83.33%, #ff0000 100%)";

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const channelToHex = (channel: number) =>
  Math.round(clamp(channel, 0, 255))
    .toString(16)
    .padStart(2, "0");
const alphaToHex = (alpha: number) => channelToHex(clamp(alpha, 0, 1) * 255);

export const isCompleteHex = (value: string) =>
  /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim());

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

export const colorToHsv = ({ r, g, b }: RgbaColor): HsvColor => {
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
  return { h: h < 0 ? h + 360 : h, s: max === 0 ? 0 : delta / max, v: max };
};

export const hsvToColor = ({ h, s, v }: HsvColor, alpha: number): RgbaColor => {
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
  return { r: (red + match) * 255, g: (green + match) * 255, b: (blue + match) * 255, a: alpha };
};

export const normalizeColor = (value: string) =>
  rgbaToHex(parseHexColor(value) ?? { r: 0, g: 0, b: 0, a: 1 });
export const colorToCss = ({ r, g, b, a }: RgbaColor) => `rgba(${r}, ${g}, ${b}, ${a})`;
