import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Step = (typeof STEPS)[number];
export const COLOR_KEYS = ["red", "orange", "yellow", "green", "aqua", "blue", "purple"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];
const SCALE_KEYS = ["neutral", ...COLOR_KEYS] as const;
type ScaleKey = (typeof SCALE_KEYS)[number];
export type Mode = "dark" | "light";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PACKAGE_ROOT = join(ROOT, "packages/design-system");
const THEMES_ROOT = join(PACKAGE_ROOT, "src/themes");
const VENDOR_ROOT = join(PACKAGE_ROOT, "vendor/tinted-theming-schemes");
const DOMAIN_ROOT = join(ROOT, "packages/domain/src");
const STYLES_ROOT = join(PACKAGE_ROOT, "src/styles");
const SOURCE_COMMIT = "fdca32a0d14ec80ad83a78a9ccb85592ca6cb9e1";
const NEUTRAL_THRESHOLD = 0.05;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Oklch {
  l: number;
  c: number;
  h: number;
}

type Triple = readonly [number, number, number];
// Mapping over a type parameter keeps tuple shape; `keyof typeof STEPS` alone
// would map every array member instead.
type Replace<Tuple extends readonly unknown[], T> = { readonly [K in keyof Tuple]: T };
type StepTuple<T> = Replace<typeof STEPS, T>;
type OklchScale = Record<Step, Oklch>;

const PALETTE_KEYS = [
  "base00",
  "base01",
  "base02",
  "base03",
  "base04",
  "base05",
  "base06",
  "base07",
  "base08",
  "base09",
  "base0a",
  "base0b",
  "base0c",
  "base0d",
  "base0e",
] as const;
type PaletteKey = (typeof PALETTE_KEYS)[number];
type Palette = Record<PaletteKey, string>;

const HUE_SOURCES: Record<ColorKey, PaletteKey> = {
  red: "base08",
  orange: "base09",
  yellow: "base0a",
  green: "base0b",
  aqua: "base0c",
  blue: "base0d",
  purple: "base0e",
};

interface Scheme {
  name: string;
  variant: Mode;
  palette: Palette;
  source: string;
}

export interface ThemeManifestEntry {
  key: string;
  label: string;
  primary: ColorKey;
  dark: string;
  light: string;
}

interface Manifest {
  sourceCommit: string;
  themes: [ThemeManifestEntry, ...ThemeManifestEntry[]];
}

export interface GeneratedTheme {
  key: string;
  label: string;
  primary: ColorKey;
  mode: Mode;
  scales: Record<ScaleKey, Record<Step, string>>;
  semantic: Record<SemanticToken, string>;
}

type SemanticToken =
  | "background"
  | "sunken"
  | "foreground"
  | "card"
  | "card-foreground"
  | "popover"
  | "popover-foreground"
  | "secondary"
  | "secondary-foreground"
  | "muted"
  | "muted-foreground"
  | "accent"
  | "accent-foreground"
  | "primary"
  | "primary-foreground"
  | "destructive"
  | "destructive-foreground"
  | "success"
  | "success-foreground"
  | "live"
  | "live-foreground"
  | "border"
  | "input"
  | "chip"
  | "ring"
  | "sidebar"
  | "sidebar-foreground"
  | "sidebar-primary"
  | "sidebar-primary-foreground"
  | "sidebar-accent"
  | "sidebar-accent-foreground"
  | "sidebar-border"
  | "sidebar-ring";

function byStep<T>(value: (step: Step) => T): Record<Step, T> {
  return {
    50: value(50),
    100: value(100),
    200: value(200),
    300: value(300),
    400: value(400),
    500: value(500),
    600: value(600),
    700: value(700),
    800: value(800),
    900: value(900),
    950: value(950),
  };
}

function curve([
  p50,
  p100,
  p200,
  p300,
  p400,
  p500,
  p600,
  p700,
  p800,
  p900,
  p950,
]: StepTuple<Triple>): OklchScale {
  const oklch = ([l, c, h]: Triple): Oklch => ({ l, c, h });
  return {
    50: oklch(p50),
    100: oklch(p100),
    200: oklch(p200),
    300: oklch(p300),
    400: oklch(p400),
    500: oklch(p500),
    600: oklch(p600),
    700: oklch(p700),
    800: oklch(p800),
    900: oklch(p900),
    950: oklch(p950),
  };
}

const TAILWIND: Record<ColorKey, OklchScale> = {
  red: curve([
    [0.971, 0.013, 17.38],
    [0.936, 0.032, 17.717],
    [0.885, 0.062, 18.334],
    [0.808, 0.114, 19.571],
    [0.704, 0.191, 22.216],
    [0.637, 0.237, 25.331],
    [0.577, 0.245, 27.325],
    [0.505, 0.213, 27.518],
    [0.444, 0.177, 26.899],
    [0.396, 0.141, 25.723],
    [0.258, 0.092, 26.042],
  ]),
  orange: curve([
    [0.98, 0.016, 73.684],
    [0.954, 0.038, 75.164],
    [0.901, 0.076, 70.697],
    [0.837, 0.128, 66.29],
    [0.75, 0.183, 55.934],
    [0.705, 0.213, 47.604],
    [0.646, 0.222, 41.116],
    [0.553, 0.195, 38.402],
    [0.47, 0.157, 37.304],
    [0.408, 0.123, 38.172],
    [0.266, 0.079, 36.259],
  ]),
  yellow: curve([
    [0.987, 0.026, 102.212],
    [0.973, 0.071, 103.193],
    [0.945, 0.129, 101.54],
    [0.905, 0.182, 98.111],
    [0.852, 0.199, 91.936],
    [0.795, 0.184, 86.047],
    [0.681, 0.162, 75.834],
    [0.554, 0.135, 66.442],
    [0.476, 0.114, 61.907],
    [0.421, 0.095, 57.708],
    [0.286, 0.066, 53.813],
  ]),
  green: curve([
    [0.982, 0.018, 155.826],
    [0.962, 0.044, 156.743],
    [0.925, 0.084, 155.995],
    [0.871, 0.15, 154.449],
    [0.792, 0.209, 151.711],
    [0.723, 0.219, 149.579],
    [0.627, 0.194, 149.214],
    [0.527, 0.154, 150.069],
    [0.448, 0.119, 151.328],
    [0.393, 0.095, 152.535],
    [0.266, 0.065, 152.934],
  ]),
  aqua: curve([
    [0.984, 0.019, 200.873],
    [0.956, 0.045, 203.388],
    [0.917, 0.08, 205.041],
    [0.865, 0.127, 207.078],
    [0.789, 0.154, 211.53],
    [0.715, 0.143, 215.221],
    [0.609, 0.126, 221.723],
    [0.52, 0.105, 223.128],
    [0.45, 0.085, 224.283],
    [0.398, 0.07, 227.392],
    [0.302, 0.056, 229.695],
  ]),
  blue: curve([
    [0.97, 0.014, 254.604],
    [0.932, 0.032, 255.585],
    [0.882, 0.059, 254.128],
    [0.809, 0.105, 251.813],
    [0.707, 0.165, 254.624],
    [0.623, 0.214, 259.815],
    [0.546, 0.245, 262.881],
    [0.488, 0.243, 264.376],
    [0.424, 0.199, 265.638],
    [0.379, 0.146, 265.522],
    [0.282, 0.091, 267.935],
  ]),
  purple: curve([
    [0.977, 0.014, 308.299],
    [0.946, 0.033, 307.174],
    [0.902, 0.063, 306.703],
    [0.827, 0.119, 306.383],
    [0.714, 0.203, 305.504],
    [0.627, 0.265, 303.9],
    [0.558, 0.288, 302.321],
    [0.496, 0.265, 301.924],
    [0.438, 0.218, 303.724],
    [0.381, 0.176, 304.987],
    [0.291, 0.149, 302.717],
  ]),
};

const NEUTRAL_REFERENCE = byStep((step) => ({
  ...TAILWIND.blue[step],
  c: TAILWIND.blue[step].c * 0.08,
}));

const NEUTRAL_MAX_CHROMA = 0.035;
const NEUTRAL_LIGHTNESS_FLOOR = 0.09;
const NEUTRAL_LIGHTNESS_CEILING = 0.985;

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

function rgbToOklab(rgb: Rgb): [number, number, number] {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  return [
    0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  ];
}

function oklabToRgb([l, a, b]: [number, number, number]): Rgb {
  const lRoot = l + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = l - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = lRoot ** 3;
  const m3 = mRoot ** 3;
  const s3 = sRoot ** 3;
  return {
    r: linearToSrgb(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    g: linearToSrgb(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    b: linearToSrgb(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
  };
}

function rgbToOklch(rgb: Rgb): Oklch {
  const [l, a, b] = rgbToOklab(rgb);
  return { l, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

function oklchToOklab(color: Oklch): [number, number, number] {
  const angle = (color.h * Math.PI) / 180;
  return [color.l, color.c * Math.cos(angle), color.c * Math.sin(angle)];
}

function oklchToRgb(color: Oklch): Rgb {
  return oklabToRgb(oklchToOklab(color));
}

function isInGamut(rgb: Rgb): boolean {
  return (
    rgb.r >= -0.0001 &&
    rgb.r <= 1.0001 &&
    rgb.g >= -0.0001 &&
    rgb.g <= 1.0001 &&
    rgb.b >= -0.0001 &&
    rgb.b <= 1.0001
  );
}

function gamutMap(color: Oklch): Oklch {
  if (isInGamut(oklchToRgb(color))) return color;
  let low = 0;
  let high = color.c;
  for (let index = 0; index < 24; index += 1) {
    const candidate = { ...color, c: (low + high) / 2 };
    if (isInGamut(oklchToRgb(candidate))) low = candidate.c;
    else high = candidate.c;
  }
  return { ...color, c: low };
}

function parseHex(value: string): Rgb {
  const normalized = value.trim().replace(/^#/, "");
  if (!/^[\da-f]{6}$/i.test(normalized)) throw new Error(`Invalid color value: ${value}`);
  return {
    r: parseInt(normalized.slice(0, 2), 16) / 255,
    g: parseInt(normalized.slice(2, 4), 16) / 255,
    b: parseInt(normalized.slice(4, 6), 16) / 255,
  };
}

function toHex(color: Oklch): string {
  const rgb = oklchToRgb(gamutMap(color));
  return `#${[rgb.r, rgb.g, rgb.b]
    .map((channel) =>
      Math.round(clamp(channel) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function nearestReferenceStep(seed: Oklch, reference: OklchScale): Step {
  return STEPS.reduce<Step>(
    (best, step) =>
      Math.abs(reference[step].l - seed.l) < Math.abs(reference[best].l - seed.l) ? step : best,
    STEPS[0],
  );
}

// Steps run from light to dark. Clamp, in place, any step that comes out
// lighter than the one before it so the ramp never reverses.
function flattenLightnessReversals(colors: OklchScale): void {
  let previous = colors[STEPS[0]];
  for (const step of STEPS) {
    const current = colors[step];
    if (current.l > previous.l) current.l = previous.l;
    previous = current;
  }
}

export function generateScale(seedHex: string, key: ColorKey): Record<Step, string> {
  const seed = rgbToOklch(parseHex(seedHex));
  const reference = seed.c < NEUTRAL_THRESHOLD ? NEUTRAL_REFERENCE : TAILWIND[key];
  const anchor = nearestReferenceStep(seed, reference);
  const anchorReference = reference[anchor];
  const colors = byStep((step) => {
    const point = reference[step];
    const hueDelta = seed.c < NEUTRAL_THRESHOLD ? 0 : point.h - anchorReference.h;
    return gamutMap({
      l: seed.l + point.l - anchorReference.l,
      c: Math.max(0, seed.c + point.c - anchorReference.c),
      h: seed.h + hueDelta,
    });
  });
  colors[anchor] = seed;
  flattenLightnessReversals(colors);
  return byStep((step) => toHex(colors[step]));
}

function interpolate(a: Oklch, b: Oklch, fraction: number): Oklch {
  // Mix through Oklab so near-grey anchors whose hue angles straddle 0/360 do
  // not swing through the entire color wheel on the way past each other.
  const [al, aa, ab] = oklchToOklab(a);
  const [bl, ba, bb] = oklchToOklab(b);
  const mixed: [number, number, number] = [
    al + (bl - al) * fraction,
    aa + (ba - aa) * fraction,
    ab + (bb - ab) * fraction,
  ];
  return {
    l: mixed[0],
    c: Math.hypot(mixed[1], mixed[2]),
    h: ((Math.atan2(mixed[2], mixed[1]) * 180) / Math.PI + 360) % 360,
  };
}

// A neutral may carry the scheme's tint, but chroma has to fall away as the
// step approaches white or black — otherwise Gruvbox's cream base00 reads as
// sickly yellow rather than a warm off-white.
function neutralChromaCeiling(lightness: number): number {
  return NEUTRAL_MAX_CHROMA * Math.sqrt(Math.max(0, 4 * lightness * (1 - lightness)));
}

function desaturateNeutral(color: Oklch): Oklch {
  return { ...color, c: Math.min(color.c, neutralChromaCeiling(color.l)) };
}

// Continue the reference curve's lightness rolloff past the outermost trusted
// anchor, compressed so the run lands exactly on `limit` when it would
// otherwise overshoot into clipping. `targets` leads with the outermost step,
// the one that would land on `limit`.
function extrapolateNeutral(
  anchor: Oklch,
  anchorStep: Step,
  targets: readonly [outermost: Step, ...inner: Step[]],
  limit: number,
): Map<Step, Oklch> {
  const [outermost] = targets;
  const needed = NEUTRAL_REFERENCE[outermost].l - NEUTRAL_REFERENCE[anchorStep].l;
  const available = limit - anchor.l;
  const factor = needed === 0 ? 0 : Math.min(1, available / needed);
  return new Map(
    targets.map((step) => [
      step,
      {
        ...anchor,
        l: clamp(anchor.l + (NEUTRAL_REFERENCE[step].l - NEUTRAL_REFERENCE[anchorStep].l) * factor),
      },
    ]),
  );
}

function interpolateGap(known: Map<Step, Oklch>, step: Step): Oklch {
  let lower: [Step, Oklch] | undefined;
  let upper: [Step, Oklch] | undefined;
  for (const [candidate, color] of known) {
    if (candidate < step && (!lower || candidate > lower[0])) lower = [candidate, color];
    if (candidate > step && (!upper || candidate < upper[0])) upper = [candidate, color];
  }
  if (!lower || !upper) throw new Error(`Neutral step ${step} has no anchor on both sides`);
  const [lowerStep, lowerColor] = lower;
  const [upperStep, upperColor] = upper;
  return interpolate(upperColor, lowerColor, (upperStep - step) / (upperStep - lowerStep));
}

export function generateNeutralScale(scheme: Scheme): Record<Step, string> {
  // Base16 nominally reserves base06/base07 for lighter foreground shades, but
  // plenty of schemes (Catppuccin's rosewater/lavender being the worst offender)
  // put accent hues there. Only base00-base05 can be trusted to be neutral, so
  // the extreme steps are extrapolated from the reference curve instead.
  const trusted = (key: PaletteKey) => rgbToOklch(parseHex(scheme.palette[key]));
  const base00 = trusted("base00");
  const base01 = trusted("base01");
  const base02 = trusted("base02");
  const base03 = trusted("base03");
  const base04 = trusted("base04");
  const base05 = trusted("base05");
  const dark = scheme.variant === "dark";
  // base00 is the background either way, but base01 sits on either side of it
  // depending on the scheme: Gruvbox's bg1 is lighter, Catppuccin's mantle is
  // darker. Anchor a darker base01 at the bottom of the scale rather than
  // letting the monotonic pass flatten 800-950 into one color.
  const mantle = dark && base01.l < base00.l;
  const result = new Map<Step, Oklch>(
    dark
      ? [
          [900, base00],
          [mantle ? 950 : 800, base01],
          [700, base02],
          [600, base03],
          [500, base04],
          [300, base05],
        ]
      : [
          [50, base00],
          [100, base01],
          [200, base02],
          [300, base03],
          [500, base04],
          [700, base05],
        ],
  );
  if (dark) {
    if (!mantle) result.set(950, { ...base00, l: clamp(base00.l - Math.abs(base01.l - base00.l)) });
    // base05 anchors step 300; 100 and 50 continue upward toward white.
    for (const [step, color] of extrapolateNeutral(
      base05,
      300,
      [50, 100],
      NEUTRAL_LIGHTNESS_CEILING,
    ))
      result.set(step, color);
  } else {
    // base05 anchors step 700; 800, 900 and 950 continue downward toward black.
    for (const [step, color] of extrapolateNeutral(
      base05,
      700,
      [950, 800, 900],
      NEUTRAL_LIGHTNESS_FLOOR,
    ))
      result.set(step, color);
  }
  const colors = byStep((step) => result.get(step) ?? interpolateGap(result, step));
  flattenLightnessReversals(colors);
  return byStep((step) => toHex(desaturateNeutral(colors[step])));
}

export function parseScheme(source: string, sourcePath = "inline"): Scheme {
  const document = parseYaml(source) as {
    name?: string;
    variant?: string;
    palette?: Record<string, unknown>;
  };
  if (!document.palette || typeof document.palette !== "object")
    throw new Error(`${sourcePath}: missing palette mapping`);
  const entries = new Map(
    Object.entries(document.palette).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const color = (key: PaletteKey): string => {
    const value = entries.get(key);
    if (value === undefined) throw new Error(`${sourcePath}: missing ${key}`);
    if (typeof value !== "string")
      throw new Error(`${sourcePath}: ${key} must be a hex color string`);
    parseHex(value);
    return value;
  };
  const palette: Palette = {
    base00: color("base00"),
    base01: color("base01"),
    base02: color("base02"),
    base03: color("base03"),
    base04: color("base04"),
    base05: color("base05"),
    base06: color("base06"),
    base07: color("base07"),
    base08: color("base08"),
    base09: color("base09"),
    base0a: color("base0a"),
    base0b: color("base0b"),
    base0c: color("base0c"),
    base0d: color("base0d"),
    base0e: color("base0e"),
  };
  const variant =
    document.variant === "light" ? "light" : document.variant === "dark" ? "dark" : null;
  if (!variant) throw new Error(`${sourcePath}: variant must be dark or light`);
  return { name: document.name ?? sourcePath, variant, palette, source: sourcePath };
}

function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
}

export function wcagRatio(foreground: string, background: string): number {
  const foregroundL = relativeLuminance(foreground);
  const backgroundL = relativeLuminance(background);
  return (Math.max(foregroundL, backgroundL) + 0.05) / (Math.min(foregroundL, backgroundL) + 0.05);
}

export function apcaLc(foreground: string, background: string): number {
  const blackClamp = (value: number) => (value <= 0.022 ? value + (0.022 - value) ** 1.414 : value);
  const text = blackClamp(relativeLuminance(foreground));
  const back = blackClamp(relativeLuminance(background));
  const polarity = back > text;
  const sapc = polarity ? back ** 0.56 - text ** 0.57 : back ** 0.65 - text ** 0.62;
  if (Math.abs(back - text) < 0.0005) return 0;
  return (polarity ? sapc * 1.14 - 0.027 : sapc * 1.14 + 0.027) * 100;
}

function deltaEok(first: string, second: string): number {
  const [l1, a1, b1] = rgbToOklab(parseHex(first));
  const [l2, a2, b2] = rgbToOklab(parseHex(second));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

function semanticValues(
  scales: Record<ScaleKey, Record<Step, string>>,
  primary: ColorKey,
  mode: Mode,
): Record<SemanticToken, string> {
  const dark = mode === "dark";
  const neutral = (step: Step) => scales.neutral[step];
  const hue = (key: ColorKey, step: Step) => scales[key][step];
  const foreground = dark ? neutral(50) : neutral(950);
  const primaryValue = hue(primary, 500);
  const primaryForeground = hue(primary, 100);
  // Floating surfaces (card/popover/sidebar) sit above the page background so
  // `bg-popover` reads as a distinct panel. Keep muted one step lighter so
  // `data-highlighted:bg-muted` still shows on popover menus.
  const surface = neutral(dark ? 700 : 100);
  // Dark backgrounds sit at 800, not 900: the darkest steps hold a scheme's
  // below-background shades (Catppuccin's mantle) and read as too dark for a
  // full-page surface.
  return {
    background: neutral(dark ? 800 : 50),
    // One step below `background`: the page surface that floating surfaces
    // (card/popover) are read against. `background` sits at 800 in dark mode
    // and 50 in light, so a single step in the darker direction is 900 and
    // 100 respectively — enough separation to group a page into regions
    // without introducing a third surface lightness next to `card`.
    sunken: neutral(dark ? 900 : 100),
    foreground: neutral(dark ? 100 : 900),
    card: surface,
    "card-foreground": foreground,
    popover: surface,
    "popover-foreground": foreground,
    secondary: neutral(dark ? 600 : 300),
    "secondary-foreground": foreground,
    muted: neutral(dark ? 600 : 200),
    "muted-foreground": neutral(dark ? 400 : 600),
    accent: primaryValue,
    "accent-foreground": primaryForeground,
    primary: primaryValue,
    "primary-foreground": primaryForeground,
    destructive: hue("red", 500),
    "destructive-foreground": hue("red", dark ? 50 : 950),
    success: hue("green", 500),
    // green-50, not `foreground`: `foreground` is neutral-100 in dark mode but
    // neutral-900 in light, so pairing it with a saturated green-500 fill put
    // near-black text on green in light mode. Step 50 is the light end of the
    // scale in both modes, which is what `primary-foreground` already relies
    // on. `destructive-foreground` still has this flaw, but it is consumed by
    // shipped components (Alert, the editor Header) and retuning it is a
    // visual change beyond this fix.
    "success-foreground": hue("green", 50),
    // A Show with a Run up is *on air*, not dangerous: `destructive` means
    // "this will delete or break something", so borrowing it for a live
    // indicator misreports the state. Green for go, on the same 500 step every
    // other semantic hue uses. `live-foreground` takes green-50 rather than
    // `foreground` because step 50 is the light end of the scale in both
    // modes, so the badge stays light-on-green instead of flipping to
    // near-black text in light mode the way `destructive-foreground` does.
    live: hue("green", 500),
    "live-foreground": hue("green", 50),
    border: neutral(dark ? 600 : 300),
    input: neutral(dark ? 500 : 400),
    // A value chip, laid at 25% over a field and read in `foreground`. Step 400 in both modes:
    // `muted-foreground` is 400 in dark but 600 in light, which darkens a light-mode chip.
    chip: neutral(400),
    ring: primaryValue,
    sidebar: surface,
    "sidebar-foreground": foreground,
    "sidebar-primary": primaryValue,
    "sidebar-primary-foreground": primaryForeground,
    "sidebar-accent": neutral(dark ? 600 : 200),
    "sidebar-accent-foreground": foreground,
    "sidebar-border": neutral(dark ? 600 : 300),
    "sidebar-ring": primaryValue,
  };
}

async function loadManifest(): Promise<Manifest> {
  const manifest = JSON.parse(await readFile(join(THEMES_ROOT, "manifest.json"), "utf8")) as {
    sourceCommit: string;
    themes: ThemeManifestEntry[];
  };
  if (manifest.sourceCommit !== SOURCE_COMMIT)
    throw new Error(`manifest sourceCommit must be ${SOURCE_COMMIT}`);
  const [defaultTheme, ...otherThemes] = Array.isArray(manifest.themes) ? manifest.themes : [];
  if (!defaultTheme) throw new Error("manifest must declare themes");
  return { sourceCommit: manifest.sourceCommit, themes: [defaultTheme, ...otherThemes] };
}

async function loadThemes(manifest: Manifest): Promise<GeneratedTheme[]> {
  const sources = manifest.themes.flatMap((entry) =>
    (["dark", "light"] as const).map((mode) => ({
      entry,
      mode,
      sourcePath: join(VENDOR_ROOT, entry[mode]),
    })),
  );
  for (const { sourcePath } of sources) {
    if (!existsSync(sourcePath))
      throw new Error(`Manifest source not found: ${relative(PACKAGE_ROOT, sourcePath)}`);
  }
  const sourceTexts = await Promise.all(
    sources.map(({ sourcePath }) => readFile(sourcePath, "utf8")),
  );
  const generated: GeneratedTheme[] = [];
  for (const [index, { entry, mode, sourcePath }] of sources.entries()) {
    const sourceText = sourceTexts[index];
    if (sourceText === undefined) throw new Error(`Manifest source missing at index ${index}`);
    const scheme = parseScheme(sourceText, relative(PACKAGE_ROOT, sourcePath));
    if (scheme.variant !== mode)
      throw new Error(`${sourcePath}: expected ${mode} scheme, got ${scheme.variant}`);
    const hue = (key: ColorKey) => generateScale(scheme.palette[HUE_SOURCES[key]], key);
    const scales = {
      neutral: generateNeutralScale(scheme),
      red: hue("red"),
      orange: hue("orange"),
      yellow: hue("yellow"),
      green: hue("green"),
      aqua: hue("aqua"),
      blue: hue("blue"),
      purple: hue("purple"),
    };
    generated.push({
      key: entry.key,
      label: entry.label,
      primary: entry.primary,
      mode,
      scales,
      semantic: semanticValues(scales, entry.primary, mode),
    });
  }
  return generated;
}

function cssThemeBlock(theme: GeneratedTheme, defaultPalette: string): string {
  const selector = theme.mode === "dark" && theme.key === defaultPalette ? ":root,\n" : "";
  const blockSelector = `${selector}[data-theme-palette="${theme.key}"][data-theme-mode="${theme.mode}"]`;
  const lines = [`${blockSelector} {`];
  for (const scale of SCALE_KEYS) {
    for (const step of STEPS)
      lines.push(`  --palette-${scale}-${step}: ${theme.scales[scale][step]};`);
  }
  const primary = theme.primary;
  for (const key of COLOR_KEYS) {
    lines.push(
      `  --palette-${key}-fill: var(--palette-${key}-${theme.mode === "dark" ? 700 : 200});`,
    );
    lines.push(`  --palette-${key}-border: var(--palette-${key}-500);`);
    lines.push(
      `  --palette-${key}-text: var(--palette-${key}-${theme.mode === "dark" ? 300 : 700});`,
    );
    lines.push(
      `  --palette-${key}-on-fill: var(--palette-${key}-${theme.mode === "dark" ? 50 : 950});`,
    );
  }
  for (const step of STEPS) {
    lines.push(`  --accent-${step}: var(--palette-${primary}-${step});`);
    lines.push(`  --destructive-${step}: var(--palette-red-${step});`);
    lines.push(`  --success-${step}: var(--palette-green-${step});`);
  }
  const dark = theme.mode === "dark";
  const neutral = (step: Step) => `var(--palette-neutral-${step})`;
  const hue = (key: ColorKey, step: Step) => `var(--palette-${key}-${step})`;
  const foreground = dark ? neutral(50) : neutral(950);
  // See semanticValues(): elevated surface for card/popover/sidebar;
  // muted stays one step lighter for hover contrast on those surfaces.
  const surface = neutral(dark ? 700 : 100);
  const appValues: Record<string, string> = {
    background: neutral(dark ? 800 : 50),
    // One step below `background`; see semanticValues() for why 900/100.
    sunken: neutral(dark ? 900 : 100),
    foreground: neutral(dark ? 100 : 900),
    card: surface,
    "card-foreground": foreground,
    popover: surface,
    "popover-foreground": foreground,
    secondary: neutral(dark ? 600 : 300),
    "secondary-foreground": foreground,
    muted: neutral(dark ? 600 : 200),
    "muted-foreground": neutral(dark ? 400 : 600),
    accent: hue(primary, 500),
    "accent-foreground": hue(primary, 50),
    primary: hue(primary, 500),
    "primary-foreground": hue(primary, 50),
    destructive: hue("red", 500),
    "destructive-foreground": hue("red", dark ? 50 : 950),
    success: hue("green", 500),
    // green-50, not `foreground`; see semanticValues() for why.
    "success-foreground": hue("green", 50),
    // On air, not dangerous; see semanticValues() for why green and why the
    // foreground is green-50 rather than `foreground`.
    live: hue("green", 500),
    "live-foreground": hue("green", 50),
    border: neutral(dark ? 600 : 300),
    input: neutral(dark ? 500 : 400),
    // See semanticValues() for why the chip is step 400 in both modes.
    chip: neutral(400),
    ring: hue(primary, 500),
    sidebar: surface,
    "sidebar-foreground": foreground,
    "sidebar-primary": hue(primary, 500),
    "sidebar-primary-foreground": hue(primary, 50),
    "sidebar-accent": neutral(dark ? 600 : 200),
    "sidebar-accent-foreground": foreground,
    "sidebar-border": neutral(dark ? 600 : 300),
    "sidebar-ring": hue(primary, 500),
  };
  for (const [key, value] of Object.entries(appValues)) lines.push(`  --${key}: ${value};`);
  lines.push("}");
  return lines.join("\n");
}

function themeAliases(): string {
  const lines = ["@theme inline {"];
  const aliases: Record<string, string> = {
    background: "background",
    sunken: "sunken",
    foreground: "foreground",
    card: "card",
    "card-foreground": "card-foreground",
    popover: "popover",
    "popover-foreground": "popover-foreground",
    primary: "primary",
    "primary-foreground": "primary-foreground",
    secondary: "secondary",
    "secondary-foreground": "secondary-foreground",
    muted: "muted",
    "muted-foreground": "muted-foreground",
    accent: "accent",
    "accent-foreground": "accent-foreground",
    destructive: "destructive",
    "destructive-foreground": "destructive-foreground",
    // `success`/`success-foreground` were defined as CSS variables but never
    // aliased into `@theme`, so `bg-success` and `text-success-foreground`
    // silently did nothing while `text-success-500` (a shade token, which was
    // aliased) worked. Both halves of a semantic pair belong here.
    success: "success",
    "success-foreground": "success-foreground",
    live: "live",
    "live-foreground": "live-foreground",
    border: "border",
    input: "input",
    chip: "chip",
    ring: "ring",
    sidebar: "sidebar",
    "sidebar-foreground": "sidebar-foreground",
    "sidebar-primary": "sidebar-primary",
    "sidebar-primary-foreground": "sidebar-primary-foreground",
    "sidebar-accent": "sidebar-accent",
    "sidebar-accent-foreground": "sidebar-accent-foreground",
    "sidebar-border": "sidebar-border",
    "sidebar-ring": "sidebar-ring",
  };
  for (const [name, variable] of Object.entries(aliases))
    lines.push(`  --color-${name}: var(--${variable});`);
  for (const key of COLOR_KEYS)
    for (const role of ["fill", "border", "text", "on-fill"])
      lines.push(`  --color-palette-${key}-${role}: var(--palette-${key}-${role});`);
  for (const family of ["accent", "destructive", "success"])
    for (const step of STEPS) lines.push(`  --color-${family}-${step}: var(--${family}-${step});`);
  lines.push("}");
  return lines.join("\n");
}

function buildGeneratedCss(themes: GeneratedTheme[], defaultPalette: string): string {
  return [
    "/* Generated by scripts/theme-generator.ts. Do not edit. */",
    themeAliases(),
    ":root { --radius: 0.5rem; }",
    ...themes.map((theme) => cssThemeBlock(theme, defaultPalette)),
    "",
  ].join("\n");
}

interface ReportRecord {
  id: string;
  palette: string;
  mode: Mode;
  kind: string;
  foreground?: string;
  background?: string;
  metric: Record<string, number>;
  status: "pass" | "advisory" | "violation";
}

function buildReport(themes: GeneratedTheme[]): {
  version: 1;
  thresholds: Record<string, number>;
  records: ReportRecord[];
} {
  const records: ReportRecord[] = [];
  for (const theme of themes) {
    const surfaceSteps = STEPS;
    const semanticPairs: Array<[SemanticToken, SemanticToken]> = [
      ["foreground", "background"],
      ["card-foreground", "card"],
      ["popover-foreground", "popover"],
      ["primary-foreground", "primary"],
      ["secondary-foreground", "secondary"],
      ["muted-foreground", "muted"],
      ["accent-foreground", "accent"],
      ["destructive-foreground", "destructive"],
      ["sidebar-foreground", "sidebar"],
      ["sidebar-primary-foreground", "sidebar-primary"],
      ["sidebar-accent-foreground", "sidebar-accent"],
    ];
    for (const [foreground, background] of semanticPairs) {
      const fg = theme.semantic[foreground];
      const bg = theme.semantic[background];
      const lc = apcaLc(fg, bg);
      const ratio = wcagRatio(fg, bg);
      records.push({
        id: `${theme.key}.${theme.mode}.semantic.${foreground}-on-${background}`,
        palette: theme.key,
        mode: theme.mode,
        kind: "semantic",
        foreground: fg,
        background: bg,
        metric: { apcaLc: lc, wcagRatio: ratio },
        status: Math.abs(lc) >= 60 && ratio >= 3 ? "pass" : "violation",
      });
    }
    for (const key of COLOR_KEYS)
      for (const step of surfaceSteps) {
        const fg = theme.scales[key][theme.mode === "dark" ? 300 : 700];
        const bg = theme.scales.neutral[step];
        const lc = apcaLc(fg, bg);
        const ratio = wcagRatio(fg, bg);
        records.push({
          id: `${theme.key}.${theme.mode}.${key}.text-on-neutral-${step}`,
          palette: theme.key,
          mode: theme.mode,
          kind: "hue-text",
          foreground: fg,
          background: bg,
          metric: { apcaLc: lc, wcagRatio: ratio },
          status: Math.abs(lc) >= 60 ? "pass" : "violation",
        });
      }
    for (const key of COLOR_KEYS) {
      const fg = theme.scales[key][theme.mode === "dark" ? 50 : 950];
      const bg = theme.scales[key][theme.mode === "dark" ? 700 : 200];
      const lc = apcaLc(fg, bg);
      const ratio = wcagRatio(fg, bg);
      records.push({
        id: `${theme.key}.${theme.mode}.${key}.on-fill`,
        palette: theme.key,
        mode: theme.mode,
        kind: "on-fill",
        foreground: fg,
        background: bg,
        metric: { apcaLc: lc, wcagRatio: ratio },
        status: Math.abs(lc) >= 60 ? "pass" : "violation",
      });
    }
    for (const [index, first] of COLOR_KEYS.entries())
      for (const second of COLOR_KEYS.slice(index + 1)) {
        const delta = deltaEok(
          theme.scales[first][theme.mode === "dark" ? 700 : 200],
          theme.scales[second][theme.mode === "dark" ? 700 : 200],
        );
        records.push({
          id: `${theme.key}.${theme.mode}.distinguishability.${first}-${second}`,
          palette: theme.key,
          mode: theme.mode,
          kind: "distinguishability",
          metric: { deltaEok: delta },
          status: delta >= 0.04 ? "pass" : delta >= 0.02 ? "advisory" : "violation",
        });
      }
  }
  return {
    version: 1,
    thresholds: {
      apcaReadable: 60,
      apcaBody: 75,
      apcaHighContrast: 90,
      wcagNormal: 4.5,
      wcagLarge: 3,
      wcagNonText: 3,
      deltaEokPass: 0.04,
      deltaEokViolation: 0.02,
    },
    records: records.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function generatedMetadata(): string {
  return `// Generated by scripts/theme-generator.ts.\nexport const THEME_COLOR_METADATA = ${JSON.stringify(
    COLOR_KEYS.map((key, order) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      order,
      swatchToken: `--palette-${key}-fill`,
    })),
    null,
    2,
  )} as const;\nexport type ThemeColorKey = (typeof THEME_COLOR_METADATA)[number]["key"];\n`;
}
function generatedPaletteCatalog(manifest: Manifest): string {
  const metadata = manifest.themes.map(({ key, label, primary }) => ({ key, label, primary }));
  return `// Generated by @mechane/design-system's theme generator. Do not edit by hand.\nexport const THEME_PALETTE_METADATA = ${JSON.stringify(metadata, null, 2)} as const;\n`;
}

export async function generate(): Promise<void> {
  const manifest = await loadManifest();
  const themes = await loadThemes(manifest);
  await writeFile(
    join(STYLES_ROOT, "generated-theme.css"),
    buildGeneratedCss(themes, manifest.themes[0].key),
    "utf8",
  );
  await writeFile(
    join(STYLES_ROOT, "contrast-report.json"),
    `${JSON.stringify(buildReport(themes), null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(STYLES_ROOT, "contrast-acknowledgements.json"),
    `${JSON.stringify({ version: 1, acknowledgements: [] }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(THEMES_ROOT, "generated.ts"), generatedMetadata(), "utf8");
  await writeFile(
    join(DOMAIN_ROOT, "theme-catalog.generated.ts"),
    generatedPaletteCatalog(manifest),
    "utf8",
  );
  console.log(
    `Generated ${themes.length} palette modes and ${themes.length * (COLOR_KEYS.length * 11 + 8 + 7 * 6 + 21)} contrast records.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)))
  await generate();
