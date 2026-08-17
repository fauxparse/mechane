/**
 * Generates favicons, app icons and web manifests for the Studio and Player
 * apps from the Mechanē glyph (issue #303).
 *
 * Run with `pnpm --filter @mechane/design-system generate:icons`. The output is
 * committed, so CI never needs to rasterize anything.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { MECHANE_ICON_PATH, MECHANE_ICON_VIEWBOX } from "../src/icons/mechane-path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../..");

/**
 * Pulled from the default theme (`src/styles/generated-theme.css`). Hard-coded
 * rather than parsed: these are the brand marks, and they should only move when
 * someone deliberately re-runs this script.
 */
const COLORS = {
  /** `--palette-neutral-800`, the dark-mode background. */
  dark: "#3c3836",
  /** `--palette-neutral-50`, the light-mode foreground. */
  light: "#fdfaf4",
  /** `--palette-orange-500`, the brand accent. */
  brand: "#fb6400",
};

type App = {
  /** Directory under `apps/`. */
  dir: string;
  name: string;
  shortName: string;
  description: string;
};

const APPS: App[] = [
  {
    dir: "studio",
    name: "Mechanē Studio",
    shortName: "Studio",
    description: "Build and run interactive live-theatre tech.",
  },
  {
    dir: "player",
    name: "Mechanē",
    shortName: "Mechanē",
    description: "Take part in an interactive live-theatre show.",
  },
];

/** The glyph on its own, scaled to fill `size` with `padding` units of margin. */
const glyph = (fill: string, size: number, padding: number) => {
  const scale = (size - padding * 2) / MECHANE_ICON_VIEWBOX;
  return `<g transform="translate(${padding} ${padding}) scale(${scale})"><path d="${MECHANE_ICON_PATH}" fill="${fill}" fill-rule="evenodd" /></g>`;
};

/**
 * Transparent-background favicon whose glyph follows the browser's own
 * light/dark preference, so it stays legible against either tab-bar colour.
 */
const faviconSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MECHANE_ICON_VIEWBOX} ${MECHANE_ICON_VIEWBOX}" width="${MECHANE_ICON_VIEWBOX}" height="${MECHANE_ICON_VIEWBOX}">
  <style>
    :root { color-scheme: light dark; }
    .glyph { fill: ${COLORS.dark}; }
    @media (prefers-color-scheme: dark) { .glyph { fill: ${COLORS.light}; } }
  </style>
  <path class="glyph" fill-rule="evenodd" d="${MECHANE_ICON_PATH}" />
</svg>
`;

/** Opaque brand tile, used for the PNG icons that can't be theme-aware. */
const tileSvg = ({ size, radius, padding }: { size: number; radius: number; padding: number }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${COLORS.brand}" />
  ${glyph(COLORS.light, size, padding)}
</svg>
`;

const png = (svg: string, size: number) =>
  sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

const manifest = (app: App) =>
  `${JSON.stringify(
    {
      name: app.name,
      short_name: app.shortName,
      description: app.description,
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: COLORS.dark,
      theme_color: COLORS.dark,
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        {
          src: "/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
        { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
      ],
    },
    null,
    2,
  )}\n`;

for (const app of APPS) {
  const out = path.join(REPO_ROOT, "apps", app.dir, "public");
  await mkdir(out, { recursive: true });

  // Square-ish tile for the regular icons; maskable needs the glyph inside the
  // 80% safe zone, so it gets a full-bleed square with much more padding.
  const tile = tileSvg({ size: 512, radius: 96, padding: 96 });
  const maskable = tileSvg({ size: 512, radius: 0, padding: 128 });

  await Promise.all([
    writeFile(path.join(out, "favicon.svg"), faviconSvg()),
    writeFile(path.join(out, "manifest.webmanifest"), manifest(app)),
    png(tile, 32).then((data) => writeFile(path.join(out, "favicon-32.png"), data)),
    png(tile, 180).then((data) => writeFile(path.join(out, "apple-touch-icon.png"), data)),
    png(tile, 192).then((data) => writeFile(path.join(out, "icon-192.png"), data)),
    png(tile, 512).then((data) => writeFile(path.join(out, "icon-512.png"), data)),
    png(maskable, 512).then((data) => writeFile(path.join(out, "icon-maskable-512.png"), data)),
  ]);

  console.log(`Wrote icons for ${app.name} to ${path.relative(REPO_ROOT, out)}`);
}
