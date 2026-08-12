import { describe, expect, it } from "vitest";

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  STEPS,
  apcaLc,
  generateNeutralScale,
  generateScale,
  parseScheme,
  wcagRatio,
} from "./theme-generator";

const VENDOR_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../vendor/tinted-theming-schemes",
);

const loadScheme = async (path: string) =>
  parseScheme(await readFile(join(VENDOR_ROOT, path), "utf8"), path);

const chroma = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const toLinear = (value: number) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const [lin, mid, high] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lin + 0.5363325363 * mid + 0.0514459929 * high);
  const m = Math.cbrt(0.2119034982 * lin + 0.6806995451 * mid + 0.1073969566 * high);
  const s = Math.cbrt(0.0883024619 * lin + 0.2817188376 * mid + 0.6299787005 * high);
  return Math.hypot(
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  );
};

describe("theme source parser", () => {
  it("normalizes Base16 keys and accepts hash-prefixed values", () => {
    const scheme = parseScheme(`
name: Test
variant: dark
palette:
  base00: "#101010"
  base01: "#202020"
  base02: "#303030"
  base03: "#404040"
  base04: "#505050"
  base05: "#606060"
  base06: "#707070"
  base07: "#808080"
  base08: "#ff0000"
  base09: "#ff8000"
  base0A: "#ffff00"
  base0B: "#00ff00"
  base0C: "#00ffff"
  base0D: "#0000ff"
  base0E: "#8000ff"
`);

    expect(scheme.variant).toBe("dark");
    expect(scheme.palette.base0a).toBe("#ffff00");
    expect(scheme.palette.base0e).toBe("#8000ff");
  });
});

describe("scale generation", () => {
  it("emits every absolute step and pins an authored seed", () => {
    const scale = generateScale("#00ff00", "green");

    expect(Object.keys(scale).map(Number)).toEqual([...STEPS]);
    expect(Object.values(scale)).toContain("#00ff00");
  });
});

describe("neutral scale generation", () => {
  const schemes = [
    "base16/catppuccin-latte.yaml",
    "base16/catppuccin-mocha.yaml",
    "base16/gruvbox-light-medium.yaml",
    "base16/gruvbox-dark-medium.yaml",
  ];

  it.each(schemes)("keeps %s free of accent hues", async (path) => {
    const scale = generateNeutralScale(await loadScheme(path));

    // base06/base07 are rosewater and lavender in Catppuccin; nothing in a
    // neutral scale may be as colorful as a real accent.
    for (const step of STEPS) expect(chroma(scale[step])).toBeLessThan(0.04);
  });

  it.each(schemes)("keeps %s on a single hue and monotonic ramp", async (path) => {
    const scale = generateNeutralScale(await loadScheme(path));
    const luminance = STEPS.map((step) => apcaLc(scale[step], "#ffffff"));

    expect(luminance).toEqual([...luminance].sort((a, b) => a - b));
    expect(new Set(STEPS.map((step) => scale[step])).size).toBe(STEPS.length);
  });

  it("desaturates the lightest steps so tinted backgrounds stay near-white", async () => {
    const gruvbox = generateNeutralScale(await loadScheme("base16/gruvbox-light-medium.yaml"));

    // Gruvbox's own base00 (#fbf1c7) is a sickly yellow at this lightness.
    expect(chroma(gruvbox[50])).toBeLessThan(chroma("#fbf1c7"));
    expect(chroma(gruvbox[50])).toBeLessThan(0.02);
  });

  it("anchors a below-background base01 at the dark end of the scale", async () => {
    const mocha = generateNeutralScale(await loadScheme("base16/catppuccin-mocha.yaml"));

    expect(mocha[900]).toBe("#1e1e2e"); // base
    expect(mocha[950]).toBe("#181825"); // mantle
  });
});

describe("contrast metrics", () => {
  it("returns directional APCA and WCAG measurements", () => {
    expect(apcaLc("#000000", "#ffffff")).toBeGreaterThan(0);
    expect(apcaLc("#ffffff", "#000000")).toBeLessThan(0);
    expect(wcagRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
});
