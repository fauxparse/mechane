import { ThemeProvider } from "@mechane/design-system";
import { DEFAULT_THEME_PALETTE, THEME_PALETTE_METADATA } from "@mechane/domain";
import { createElement } from "react";
import { Preview } from "@storybook/react-vite";

import "@mechane/design-system/styles/globals.css";

// Toolbar controls for verifying every story in both modes and both
// built-in themes. Values match @mechane/domain's ThemeMode/ThemePalette.
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
        items: THEME_PALETTE_METADATA.map(({ key, label }) => ({
          value: key,
          title: key === DEFAULT_THEME_PALETTE ? `${label} (default)` : label,
        })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    mode: "dark",
    palette: DEFAULT_THEME_PALETTE,
  },
  decorators: [
    (Story, context) =>
      createElement(
        ThemeProvider,
        { mode: context.globals.mode, palette: context.globals.palette },
        context.parameters.layout === "fullscreen"
          ? createElement(Story)
          : createElement(
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
