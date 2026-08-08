import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";

// Repository-level component workbench for Studio and shared workspace
// packages. Tailwind needs to see their classes through this Storybook's
// Vite build the same way it does through each package's application build.
const config: StorybookConfig = {
  stories: [
    "../../apps/studio/src/**/*.stories.@(ts|tsx)",
    "../../packages/design-system/src/**/*.stories.@(ts|tsx)",
    "../../packages/rendering/src/**/*.stories.@(ts|tsx)",
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
