import { useQuery } from "@tanstack/react-query";
import type { Element } from "@mechane/domain";

import type { CanvasArtboardDocument } from "../../api/canvas";

export type GoogleFont = {
  family: string;
  variants: readonly string[];
};

export type GoogleFontVariant = {
  weight: number;
  italic: boolean;
};

type GoogleFontsResponse = {
  items?: GoogleFont[];
};
export const GOOGLE_FONTS_API_KEY = import.meta.env.VITE_GOOGLE_FONTS_API_KEY;
let googleFontsCache: readonly GoogleFont[] | null = null;

export const primaryFontFamily = (value: string): string =>
  (value.split(",")[0]?.trim() ?? "").replace(/^['"]|['"]$/g, "");

export const fontFamilyKey = (value: string): string => primaryFontFamily(value).toLowerCase();

export function collectFontFamilies(
  artboards: readonly CanvasArtboardDocument[],
): readonly string[] {
  const families = new Set<string>();
  const visit = (element: Element) => {
    if (element.type === "text" && typeof element.fontFamily === "string") {
      const family = element.fontFamily.trim();
      if (family) families.add(family);
    }
    element.children?.forEach(visit);
  };
  artboards.forEach((artboard) => visit(artboard.canvas.root));
  return [...families];
}
const fontVariantName = (weight: number, italic: boolean): string =>
  italic
    ? weight === 400
      ? "italic"
      : `${weight}italic`
    : weight === 400
      ? "regular"
      : `${weight}`;

export function googleFontVariant(
  font: GoogleFont | undefined,
  bold: boolean,
  italic: boolean,
): GoogleFontVariant | null {
  if (!font) return { weight: bold ? 700 : 400, italic };

  const preferredWeights = bold
    ? [700, 600, 800, 900, 500, 400, 300, 200, 100]
    : [400, 300, 500, 200, 600, 700, 800, 900, 100];
  const variants = new Set(font.variants);
  const weight = preferredWeights.find((candidate) =>
    variants.has(fontVariantName(candidate, italic)),
  );
  return weight === undefined ? null : { weight, italic };
}
async function fetchGoogleFonts(signal: AbortSignal): Promise<readonly GoogleFont[]> {
  if (!GOOGLE_FONTS_API_KEY) return [];
  if (googleFontsCache) return googleFontsCache;
  const response = await fetch(
    `https://www.googleapis.com/webfonts/v1/webfonts?sort=popularity&key=${encodeURIComponent(GOOGLE_FONTS_API_KEY)}`,
    { signal },
  );
  if (!response.ok) throw new Error(`Google Fonts request failed (${response.status})`);
  const data = (await response.json()) as GoogleFontsResponse;
  googleFontsCache = data.items ?? [];
  return googleFontsCache;
}

export function useGoogleFonts() {
  return useQuery({
    queryKey: ["google-fonts"],
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchGoogleFonts(signal),
    enabled: Boolean(GOOGLE_FONTS_API_KEY),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function loadGoogleFont(fontFamily: string, variant?: GoogleFontVariant): void {
  if (typeof document === "undefined") return;
  const family = primaryFontFamily(fontFamily);
  if (!family) return;
  const request = variant
    ? `${family}:ital,wght@${variant.italic ? 1 : 0},${variant.weight}`
    : family;
  const id = `google-font-${encodeURIComponent(request)}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(request).replace(/%20/g, "+")}&display=swap`;
  document.head.append(link);
}
