import { describe, expect, it } from "vitest";

import {
  assertValidThemeMode,
  assertValidThemePalette,
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_PALETTE,
  defaultThemeSettings,
  InvalidThemeModeError,
  InvalidThemePaletteError,
} from "./theme-settings";

describe("assertValidThemeMode", () => {
  it("accepts every known mode", () => {
    expect(assertValidThemeMode("light")).toBe("light");
    expect(assertValidThemeMode("dark")).toBe("dark");
  });

  it("rejects anything else", () => {
    expect(() => assertValidThemeMode("blue")).toThrow(InvalidThemeModeError);
    expect(() => assertValidThemeMode("")).toThrow(InvalidThemeModeError);
  });
});

describe("assertValidThemePalette", () => {
  it("accepts every known palette", () => {
    expect(assertValidThemePalette("slate")).toBe("slate");
    expect(assertValidThemePalette("gruvbox")).toBe("gruvbox");
  });

  it("rejects anything else", () => {
    expect(() => assertValidThemePalette("solarized")).toThrow(InvalidThemePaletteError);
  });
});

describe("defaultThemeSettings", () => {
  it("matches the PRD default (dark, slate)", () => {
    expect(defaultThemeSettings()).toEqual({
      mode: DEFAULT_THEME_MODE,
      palette: DEFAULT_THEME_PALETTE,
    });
    expect(defaultThemeSettings()).toEqual({ mode: "dark", palette: "slate" });
  });
});
