import type { GradientFill, GradientStop } from "@mechane/domain";

const DEFAULT_GRADIENT: GradientFill = {
  kind: "linear",
  angle: 0,
  stops: [
    { color: "#000000", position: 0 },
    { color: "#ffffff", position: 1 },
  ],
};

export const gradientForMode = (
  mode: "linear" | "radial",
  existing?: GradientFill | null,
): GradientFill => (existing ? { ...existing, kind: mode } : { ...DEFAULT_GRADIENT, kind: mode });

const parseHexChannels = (color: string | undefined): [number, number, number] | null => {
  const hex = color?.trim().replace(/^#/, "");
  if (!hex || !/^[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(hex)) return null;
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
};

const blendHexColors = (left?: string, right?: string) => {
  const start = parseHexChannels(left);
  const end = parseHexChannels(right);
  if (!start || !end) return left ?? right ?? "#808080";
  const channel = (leftChannel: number, rightChannel: number) =>
    Math.round((leftChannel + rightChannel) / 2)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(start[0], end[0])}${channel(start[1], end[1])}${channel(start[2], end[2])}`;
};

export const insertedGradientStop = (stops: readonly GradientStop[]): GradientStop => {
  const ordered = [...stops].sort((left, right) => left.position - right.position);
  const previous = ordered.at(-2);
  const last = ordered.at(-1);
  if (!previous || !last) return { color: "#808080", position: 0.5 };
  return {
    color: blendHexColors(previous.color, last.color),
    position: (previous.position + last.position) / 2,
  };
};
