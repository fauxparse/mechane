// Bridges the persisted UserSettings (apps/api's `userSettings` query) to
// @mechane/design-system's network-free ThemeProvider. Signed-out
// visitors get the generated default palette rather than an unauthenticated
// GraphQL error — `useUserSettings` is skipped entirely until `useMe`
// confirms a session exists.
import { ThemeProvider } from "@mechane/design-system";
import type { ThemeMode, ThemePalette } from "@mechane/domain";
import { DEFAULT_THEME_MODE, DEFAULT_THEME_PALETTE } from "@mechane/domain";
import type { ReactNode } from "react";

import { useMe } from "./api/me";
import { useUserSettings } from "./api/settings";

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const settings = useUserSettings({ enabled: Boolean(me.data) });

  const mode = (settings.data?.themeMode ?? DEFAULT_THEME_MODE) as ThemeMode;
  const palette = (settings.data?.themePalette ?? DEFAULT_THEME_PALETTE) as ThemePalette;

  return (
    <ThemeProvider mode={mode} palette={palette}>
      {children}
    </ThemeProvider>
  );
}
