import { ThemeProvider } from "@presence/design-system";
import type { Preview } from "@storybook/react-vite";
import { createElement } from "react";

import "@presence/design-system/styles/globals.css";

// Toolbar controls for verifying every story in both modes and both
// built-in themes (PRD.md §9's "component convention" acceptance bar —
// see issue #14). Values match @presence/domain's ThemeMode/ThemePalette.
const preview: Preview = {
  globalTypes: {
    mode: {
      description: "Theme mode",
      toolbar: {
        title: "Mode",
        icon: "mirror",
        items: [
          { value: "dark", title: "Dark" },
          { value: "light", title: "Light" },
        ],
        dynamicTitle: true,
      },
    },
    palette: {
      description: "Theme palette",
      toolbar: {
        title: "Palette",
        icon: "paintbrush",
        items: [
          { value: "slate", title: "Slate (default)" },
          { value: "gruvbox", title: "Gruvbox" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    mode: "dark",
    palette: "slate",
  },
  decorators: [
    (Story, context) =>
      createElement(
        ThemeProvider,
        { mode: context.globals.mode, palette: context.globals.palette },
        createElement(
          "div",
          { className: "bg-background p-6 text-foreground" },
          createElement(Story),
        ),
      ),
  ],
  parameters: {
    layout: "centered",
  },
};

export default preview;
