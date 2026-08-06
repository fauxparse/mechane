// Applies the active mode/palette to the DOM (PRD.md §7). Deliberately
// network-free — like ShowListItem/ShowNameForm in app-studio, this takes
// already-resolved data as props rather than fetching anything itself.
// Persisting a user's choice (the GraphQL mutation) is the consuming app's
// job: see apps/app-studio's api/settings.ts + SettingsRoute, which reads
// @presence/graphql-schema's userSettings query/mutation and passes the
// result down as `mode`/`palette` here.
import { createContext, useContext, useEffect, useMemo } from "react";
import type { ReactNode } from "react";

import { DEFAULT_THEME_MODE, DEFAULT_THEME_PALETTE } from "@presence/domain";
import type { ThemeMode, ThemePalette } from "@presence/domain";

export interface ThemeContextValue {
  mode: ThemeMode;
  palette: ThemePalette;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: DEFAULT_THEME_MODE,
  palette: DEFAULT_THEME_PALETTE,
});

export interface ThemeProviderProps {
  /** Defaults to PRD.md §7's default ("dark") when omitted/pending. */
  mode?: ThemeMode;
  /** Defaults to PRD.md §7's default ("slate") when omitted/pending. */
  palette?: ThemePalette;
  children: ReactNode;
}

/**
 * Sets `data-theme-mode`/`data-theme-palette` on `<html>` — every color
 * token in styles/globals.css is keyed off those two attributes, so this
 * is the single place a mode/palette choice becomes visible tokens.
 */
export function ThemeProvider({
  mode = DEFAULT_THEME_MODE,
  palette = DEFAULT_THEME_PALETTE,
  children,
}: ThemeProviderProps) {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme-mode", mode);
  }, [mode]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme-palette", palette);
  }, [palette]);

  const value = useMemo(() => ({ mode, palette }), [mode, palette]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The mode/palette currently applied by the nearest `ThemeProvider`. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
