// The theme switcher UI (PRD.md §7): mode (light/dark) and palette (which
// built-in theme) are independent choices, each rendered as a small group
// of toggle Buttons. Presentational — like ShowListItem/ShowNameForm, the
// consumer (apps/studio's SettingsRoute) supplies the current
// mode/palette and the change callbacks, wiring them to the
// userSettings GraphQL mutation.
import { THEME_PALETTES } from "@mechane/domain";
import type { ThemeMode, ThemePalette } from "@mechane/domain";
import { Moon, Sun } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";

const PALETTE_LABELS: Record<ThemePalette, string> = {
  slate: "Slate",
  gruvbox: "Gruvbox",
};

export interface ThemeSwitcherProps {
  mode: ThemeMode;
  palette: ThemePalette;
  onModeChange: (mode: ThemeMode) => void;
  onPaletteChange: (palette: ThemePalette) => void;
  className?: string;
}

export function ThemeSwitcher({
  mode,
  palette,
  onModeChange,
  onPaletteChange,
  className,
}: ThemeSwitcherProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <fieldset className="flex items-center gap-2">
        <legend className="w-20 text-sm text-muted-foreground">Mode</legend>
        <Button
          type="button"
          variant={mode === "dark" ? "default" : "outline"}
          size="sm"
          aria-pressed={mode === "dark"}
          onClick={() => onModeChange("dark")}
        >
          <Moon /> Dark
        </Button>
        <Button
          type="button"
          variant={mode === "light" ? "default" : "outline"}
          size="sm"
          aria-pressed={mode === "light"}
          onClick={() => onModeChange("light")}
        >
          <Sun /> Light
        </Button>
      </fieldset>

      <fieldset className="flex items-center gap-2">
        <legend className="w-20 text-sm text-muted-foreground">Theme</legend>
        {THEME_PALETTES.map((option) => (
          <Button
            key={option}
            type="button"
            variant={palette === option ? "default" : "outline"}
            size="sm"
            aria-pressed={palette === option}
            onClick={() => onPaletteChange(option)}
          >
            {PALETTE_LABELS[option]}
          </Button>
        ))}
      </fieldset>
    </div>
  );
}
