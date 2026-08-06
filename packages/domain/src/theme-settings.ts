// Per-account theme preference (PRD.md §7): a display mode (light/dark,
// default dark) and a palette (which of the built-in themes is active).
// Kept as domain logic — not just "whatever the UI happens to send" — so
// the same validation applies whether the value came from the GraphQL
// mutation, a future CLI/import path, or a test, per PRD.md §8.

export const THEME_MODES = ["light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const THEME_PALETTES = ["slate", "gruvbox"] as const;
export type ThemePalette = (typeof THEME_PALETTES)[number];

/** Default mode for a user with no stored preference — PRD.md §7. */
export const DEFAULT_THEME_MODE: ThemeMode = "dark";

/** Default palette for a user with no stored preference — PRD.md §7. */
export const DEFAULT_THEME_PALETTE: ThemePalette = "slate";

export class InvalidThemeModeError extends Error {
  constructor(value: string) {
    super(`Invalid theme mode: "${value}". Expected one of: ${THEME_MODES.join(", ")}.`);
    this.name = "InvalidThemeModeError";
  }
}

export class InvalidThemePaletteError extends Error {
  constructor(value: string) {
    super(`Invalid theme palette: "${value}". Expected one of: ${THEME_PALETTES.join(", ")}.`);
    this.name = "InvalidThemePaletteError";
  }
}

/**
 * Throws `InvalidThemeModeError` unless `value` is a recognised mode.
 * Use before persisting a mode from user input (e.g. the theme switcher).
 */
export function assertValidThemeMode(value: string): ThemeMode {
  if (!THEME_MODES.includes(value as ThemeMode)) {
    throw new InvalidThemeModeError(value);
  }
  return value as ThemeMode;
}

/**
 * Throws `InvalidThemePaletteError` unless `value` is a recognised palette.
 * New built-in themes should be added to `THEME_PALETTES` above — every
 * caller that validates through this function picks the addition up for
 * free, per PRD.md §7's "token-driven, not one-off hardcoded overrides".
 */
export function assertValidThemePalette(value: string): ThemePalette {
  if (!THEME_PALETTES.includes(value as ThemePalette)) {
    throw new InvalidThemePaletteError(value);
  }
  return value as ThemePalette;
}

export interface ThemeSettings {
  mode: ThemeMode;
  palette: ThemePalette;
}

/** The settings a user with no stored row should be treated as having. */
export function defaultThemeSettings(): ThemeSettings {
  return { mode: DEFAULT_THEME_MODE, palette: DEFAULT_THEME_PALETTE };
}
