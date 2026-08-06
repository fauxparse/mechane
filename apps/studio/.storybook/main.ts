import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";

// Minimal Storybook setup for studio's own visual components (PRD.md
// §9 "Component convention"). Also renders @presence/design-system's
// primitive stories, since design-system components are consumed as
// unbundled TS source (no build step) — Tailwind needs to see their
// classes through *this* Storybook's Vite build the same way it does
// through studio's own vite.config.ts.
const config: StorybookConfig = {
  stories: [
    "../src/**/*.stories.@(ts|tsx)",
    "../../../packages/design-system/src/**/*.stories.@(ts|tsx)",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  async viteFinal(viteConfig) {
    viteConfig.plugins = [...(viteConfig.plugins ?? []), tailwindcss()];
    return viteConfig;
  },
};

export default config;
