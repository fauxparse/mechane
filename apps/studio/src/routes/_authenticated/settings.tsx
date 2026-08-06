// Minimal Settings screen ("/settings", issue #14) — currently just the
// theme switcher (PRD.md §7). Reads/writes the signed-in user's
// UserSettings via GraphQL (api/settings.ts); ThemeSwitcher itself is
// presentational and knows nothing about persistence. Signed-out visitors
// never reach this component — the parent `_authenticated` layout's
// `beforeLoad` (_authenticated/route.tsx, issue #30) redirects them to
// /sign-in before it renders.
import { ThemeSwitcher } from "@presence/design-system";
import type { ThemeMode, ThemePalette } from "@presence/domain";
import { DEFAULT_THEME_MODE, DEFAULT_THEME_PALETTE } from "@presence/domain";
import { createFileRoute, Link } from "@tanstack/react-router";

import { useUpdateUserSettings, useUserSettings } from "../../api/settings";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsRoute,
});

function SettingsRoute() {
  const settings = useUserSettings();
  const updateSettings = useUpdateUserSettings();

  const mode = (settings.data?.themeMode ?? DEFAULT_THEME_MODE) as ThemeMode;
  const palette = (settings.data?.themePalette ?? DEFAULT_THEME_PALETTE) as ThemePalette;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
        Back to Shows
      </Link>
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Appearance</h2>
        <ThemeSwitcher
          mode={mode}
          palette={palette}
          onModeChange={(nextMode) => updateSettings.mutate({ themeMode: nextMode })}
          onPaletteChange={(nextPalette) => updateSettings.mutate({ themePalette: nextPalette })}
        />
      </section>
    </main>
  );
}
