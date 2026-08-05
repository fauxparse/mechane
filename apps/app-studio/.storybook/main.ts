import type { StorybookConfig } from "@storybook/react-vite";

// Minimal Storybook setup for app-studio's own visual components (PRD.md
// §9 "Component convention") — reusable design tokens/primitives live in
// @presence/design-system's own Storybook instead.
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
};

export default config;
