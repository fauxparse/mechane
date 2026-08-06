// Theme tokens (light/dark, slate-pink default, gruvbox alt — see
// styles/globals.css) and shared component primitives (Tailwind + Base UI
// + shadcn/ui). Every new visual component added here needs a Storybook
// story in the same change — see PRD.md §9 "Component convention".
export { cn } from "./lib/utils";

export { Button, buttonVariants } from "./components/ui/button";
export { Input } from "./components/ui/input";
export { Label } from "./components/ui/label";
export { ThemeSwitcher } from "./components/theme-switcher";
export type { ThemeSwitcherProps } from "./components/theme-switcher";

export { ThemeProvider, useTheme } from "./theme/theme-provider";
export type { ThemeContextValue, ThemeProviderProps } from "./theme/theme-provider";
