import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Step = (typeof STEPS)[number];
export const COLOUR_KEYS = ["red", "orange", "yellow", "green", "aqua", "blue", "purple"] as const;
export type ColourKey = (typeof COLOUR_KEYS)[number];
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

interface Scheme {
  name: string;
  variant: Mode;
  palette: Record<string, string>;
  source: string;
}

export interface ThemeManifestEntry {
  key: string;
  label: string;
  primary: ColourKey;
  dark: string;
  light: string;
}

interface Manifest {
  sourceCommit: string;
  themes: ThemeManifestEntry[];
}

export interface GeneratedTheme {
  key: string;
  label: string;
  primary: ColourKey;
  mode: Mode;
  scales: Record<string, Record<Step, string>>;
  semantic: Record<string, string>;
}

const TAILWIND: Record<string, Oklch[]> = {
  red: [
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
  ].map(([l, c, h]) => ({ l, c, h })),
  orange: [
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
  ].map(([l, c, h]) => ({ l, c, h })),
  yellow: [
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
  ].map(([l, c, h]) => ({ l, c, h })),
  green: [
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
  ].map(([l, c, h]) => ({ l, c, h })),
  aqua: [
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
  ].map(([l, c, h]) => ({ l, c, h })),
  blue: [
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
  ].map(([l, c, h]) => ({ l, c, h })),
  purple: [
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
  ].map(([l, c, h]) => ({ l, c, h })),
};

const NEUTRAL_REFERENCE = TAILWIND.blue.map((point) => ({ ...point, c: point.c * 0.08 }));

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
  if (!/^[\da-f]{6}$/i.test(normalized)) throw new Error(`Invalid colour value: ${value}`);
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

function nearestReferenceIndex(seed: Oklch, curve: Oklch[]): number {
  return curve.reduce(
    (best, point, index) =>
      Math.abs(point.l - seed.l) < Math.abs(curve[best].l - seed.l) ? index : best,
    0,
  );
}

export function generateScale(seedHex: string, key: ColourKey): Record<Step, string> {
  const seed = rgbToOklch(parseHex(seedHex));
  const curve = seed.c < NEUTRAL_THRESHOLD ? NEUTRAL_REFERENCE : TAILWIND[key];
  const anchor = nearestReferenceIndex(seed, curve);
  const values = STEPS.map((step, index) => {
    const reference = curve[index];
    const anchorReference = curve[anchor];
    const hueDelta = seed.c < NEUTRAL_THRESHOLD ? 0 : reference.h - anchorReference.h;
    return {
      step,
      color: gamutMap({
        l: seed.l + reference.l - anchorReference.l,
        c: Math.max(0, seed.c + reference.c - anchorReference.c),
        h: seed.h + hueDelta,
      }),
    };
  });
  values[anchor].color = seed;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index].color.l > values[index - 1].color.l)
      values[index].color.l = values[index - 1].color.l;
  }
  values[anchor].color = seed;
  return Object.fromEntries(values.map(({ step, color }) => [step, toHex(color)])) as Record<
    Step,
    string
  >;
}

function interpolate(a: Oklch, b: Oklch, fraction: number): Oklch {
  return {
    l: a.l + (b.l - a.l) * fraction,
    c: a.c + (b.c - a.c) * fraction,
    h: a.h + (b.h - a.h) * fraction,
  };
}

export function generateNeutralScale(scheme: Scheme): Record<Step, string> {
  const source = Object.fromEntries(
    Object.entries(scheme.palette).map(([key, value]) => [key, rgbToOklch(parseHex(value))]),
  );
  const anchorSteps =
    scheme.variant === "dark"
      ? [900, 800, 700, 600, 500, 300, 100, 50]
      : [50, 100, 200, 300, 500, 700, 900, 950];
  const anchors = [
    "base00",
    "base01",
    "base02",
    "base03",
    "base04",
    "base05",
    "base06",
    "base07",
  ].map((key, index) => ({ step: anchorSteps[index], color: source[key] }));
  const result = new Map<number, Oklch>(anchors.map(({ step, color }) => [step, color]));
  if (scheme.variant === "dark") {
    const base00 = result.get(900)!;
    const base01 = result.get(800)!;
    result.set(950, {
      l: clamp(base00.l - Math.abs(base01.l - base00.l)),
      c: base00.c,
      h: base00.h,
    });
  }
  for (let index = 0; index < STEPS.length; index += 1) {
    const step = STEPS[index];
    if (result.has(step)) continue;
    const lower = [...result.keys()]
      .filter((candidate) => candidate < step)
      .sort((a, b) => b - a)[0];
    const upper = [...result.keys()]
      .filter((candidate) => candidate > step)
      .sort((a, b) => a - b)[0];
    result.set(
      step,
      interpolate(result.get(upper)!, result.get(lower)!, (upper - step) / (upper - lower)),
    );
  }
  const ordered = [...STEPS];
  for (let index = 1; index < ordered.length; index += 1) {
    const current = result.get(ordered[index])!;
    const previous = result.get(ordered[index - 1])!;
    if (current.l > previous.l) current.l = previous.l;
  }
  return Object.fromEntries(STEPS.map((step) => [step, toHex(result.get(step)!)])) as Record<
    Step,
    string
  >;
}

export function parseScheme(source: string, sourcePath = "inline"): Scheme {
  const document = parseYaml(source) as {
    name?: string;
    variant?: string;
    palette?: Record<string, string>;
  };
  if (!document.palette || typeof document.palette !== "object")
    throw new Error(`${sourcePath}: missing palette mapping`);
  const palette = Object.fromEntries(
    Object.entries(document.palette).map(([key, value]) => [key.toLowerCase(), value]),
  );
  for (const key of [
    "base00",
    "base01",
    "base02",
    "base03",
    "base04",
    "base05",
    "base06",
    "base07",
  ]) {
    if (!(key in palette)) throw new Error(`${sourcePath}: missing ${key}`);
  }
  const variant =
    document.variant === "light" ? "light" : document.variant === "dark" ? "dark" : null;
  if (!variant) throw new Error(`${sourcePath}: variant must be dark or light`);
  for (const key of ["base08", "base09", "base0a", "base0b", "base0c", "base0d", "base0e"]) {
    if (!(key in palette)) throw new Error(`${sourcePath}: missing ${key}`);
    parseHex(palette[key]);
  }
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
  scales: Record<string, Record<Step, string>>,
  primary: ColourKey,
  mode: Mode,
): Record<string, string> {
  const dark = mode === "dark";
  const neutral = (step: Step) => scales.neutral[step];
  const hue = (key: ColourKey, step: Step) => scales[key][step];
  const foreground = dark ? neutral(50) : neutral(950);
  const primaryValue = hue(primary, 500);
  const primaryForeground = hue(primary, 100);
  return {
    background: neutral(dark ? 900 : 50),
    foreground: neutral(dark ? 100 : 900),
    card: neutral(dark ? 800 : 100),
    "card-foreground": foreground,
    popover: neutral(dark ? 800 : 100),
    "popover-foreground": foreground,
    secondary: neutral(dark ? 600 : 300),
    "secondary-foreground": foreground,
    muted: neutral(dark ? 700 : 200),
    "muted-foreground": neutral(dark ? 400 : 600),
    accent: primaryValue,
    "accent-foreground": primaryForeground,
    primary: primaryValue,
    "primary-foreground": primaryForeground,
    destructive: hue("red", 500),
    "destructive-foreground": foreground,
    success: hue("green", 500),
    "success-foreground": foreground,
    border: neutral(dark ? 600 : 300),
    input: neutral(dark ? 500 : 400),
    ring: primaryValue,
    ...Object.fromEntries(
      COLOUR_KEYS.flatMap((key) => [
        [`palette-${key}-fill`, hue(key, dark ? 700 : 200)],
        [`palette-${key}-border`, hue(key, 500)],
        [`palette-${key}-text`, hue(key, dark ? 300 : 700)],
        [`palette-${key}-on-fill`, hue(key, dark ? 50 : 950)],
      ]),
    ),
  };
}

async function loadManifest(): Promise<Manifest> {
  const manifest = JSON.parse(
    await readFile(join(THEMES_ROOT, "manifest.json"), "utf8"),
  ) as Manifest;
  if (manifest.sourceCommit !== SOURCE_COMMIT)
    throw new Error(`manifest sourceCommit must be ${SOURCE_COMMIT}`);
  if (!Array.isArray(manifest.themes) || manifest.themes.length === 0)
    throw new Error("manifest must declare themes");
  return manifest;
}

async function loadThemes(manifest: Manifest): Promise<GeneratedTheme[]> {
  const generated: GeneratedTheme[] = [];
  for (const entry of manifest.themes) {
    for (const mode of ["dark", "light"] as const) {
      const sourcePath = join(VENDOR_ROOT, entry[mode]);
      if (!existsSync(sourcePath))
        throw new Error(`Manifest source not found: ${relative(PACKAGE_ROOT, sourcePath)}`);
      const scheme = parseScheme(
        await readFile(sourcePath, "utf8"),
        relative(PACKAGE_ROOT, sourcePath),
      );
      if (scheme.variant !== mode)
        throw new Error(`${sourcePath}: expected ${mode} scheme, got ${scheme.variant}`);
      const scales: Record<string, Record<Step, string>> = {
        neutral: generateNeutralScale(scheme),
      };
      for (const key of COLOUR_KEYS)
        scales[key] = generateScale(
          scheme.palette[
            `base${key === "red" ? "08" : key === "orange" ? "09" : key === "yellow" ? "0a" : key === "green" ? "0b" : key === "aqua" ? "0c" : key === "blue" ? "0d" : "0e"}`
          ],
          key,
        );
      generated.push({
        key: entry.key,
        label: entry.label,
        primary: entry.primary,
        mode,
        scales,
        semantic: semanticValues(scales, entry.primary, mode),
      });
    }
  }
  return generated;
}

function cssThemeBlock(theme: GeneratedTheme, defaultPalette: string): string {
  const selector = theme.mode === "dark" && theme.key === defaultPalette ? ":root,\n" : "";
  const blockSelector = `${selector}[data-theme-palette="${theme.key}"][data-theme-mode="${theme.mode}"]`;
  const lines = [`${blockSelector} {`];
  for (const scale of ["neutral", ...COLOUR_KEYS]) {
    for (const step of STEPS)
      lines.push(`  --palette-${scale}-${step}: ${theme.scales[scale][step]};`);
  }
  const primary = theme.primary;
  for (const key of COLOUR_KEYS) {
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
  const hue = (key: ColourKey, step: Step) => `var(--palette-${key}-${step})`;
  const foreground = dark ? neutral(50) : neutral(950);
  const appValues: Record<string, string> = {
    background: neutral(dark ? 900 : 50),
    foreground: neutral(dark ? 100 : 900),
    card: neutral(dark ? 800 : 100),
    "card-foreground": foreground,
    popover: neutral(dark ? 800 : 100),
    "popover-foreground": foreground,
    secondary: neutral(dark ? 600 : 300),
    "secondary-foreground": foreground,
    muted: neutral(dark ? 700 : 200),
    "muted-foreground": neutral(dark ? 400 : 600),
    accent: hue(primary, 500),
    "accent-foreground": hue(primary, 50),
    primary: hue(primary, 500),
    "primary-foreground": hue(primary, 50),
    destructive: hue("red", 500),
    "destructive-foreground": foreground,
    success: hue("green", 500),
    "success-foreground": foreground,
    border: neutral(dark ? 600 : 300),
    input: neutral(dark ? 500 : 400),
    ring: hue(primary, 500),
  };
  for (const [key, value] of Object.entries(appValues)) lines.push(`  --${key}: ${value};`);
  lines.push("}");
  return lines.join("\n");
}

function themeAliases(): string {
  const lines = ["@theme inline {"];
  const aliases: Record<string, string> = {
    background: "background",
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
    border: "border",
    input: "input",
    ring: "ring",
  };
  for (const [name, variable] of Object.entries(aliases))
    lines.push(`  --color-${name}: var(--${variable});`);
  for (const key of COLOUR_KEYS)
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
    const semanticPairs: Array<[string, string]> = [
      ["foreground", "background"],
      ["card-foreground", "card"],
      ["popover-foreground", "popover"],
      ["primary-foreground", "primary"],
      ["secondary-foreground", "secondary"],
      ["muted-foreground", "muted"],
      ["accent-foreground", "accent"],
      ["destructive-foreground", "destructive"],
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
    for (const key of COLOUR_KEYS)
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
    for (const key of COLOUR_KEYS) {
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
    for (let left = 0; left < COLOUR_KEYS.length; left += 1)
      for (let right = left + 1; right < COLOUR_KEYS.length; right += 1) {
        const first = theme.scales[COLOUR_KEYS[left]][theme.mode === "dark" ? 700 : 200];
        const second = theme.scales[COLOUR_KEYS[right]][theme.mode === "dark" ? 700 : 200];
        const delta = deltaEok(first, second);
        records.push({
          id: `${theme.key}.${theme.mode}.distinguishability.${COLOUR_KEYS[left]}-${COLOUR_KEYS[right]}`,
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
  return `// Generated by scripts/theme-generator.ts.\nexport const THEME_COLOUR_METADATA = ${JSON.stringify(
    COLOUR_KEYS.map((key, order) => ({
      key,
      label: key[0].toUpperCase() + key.slice(1),
      order,
      swatchToken: `--palette-${key}-fill`,
    })),
    null,
    2,
  )} as const;\nexport type ThemeColourKey = (typeof THEME_COLOUR_METADATA)[number]["key"];\n`;
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
    `Generated ${themes.length} palette modes and ${themes.length * (COLOUR_KEYS.length * 11 + 8 + 7 * 6 + 21)} contrast records.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)))
  await generate();
