import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";

const studioSrc = fileURLToPath(new URL("../../apps/studio/src", import.meta.url));
const studioShowSrc = fileURLToPath(new URL("../../apps/studio/src/editors/show", import.meta.url));
const studioCanvasSrc = fileURLToPath(
  new URL("../../apps/studio/src/editors/canvas", import.meta.url),
);

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
    viteConfig.resolve = {
      ...viteConfig.resolve,
      alias: {
        ...viteConfig.resolve?.alias,
        "@": studioSrc,
        "@studio": studioSrc,
        "@show-editor": studioShowSrc,
        "@canvas-editor": studioCanvasSrc,
      },
    };
    const rollupOptions = viteConfig.build?.rollupOptions;
    const existingOnWarn = rollupOptions?.onwarn;

    viteConfig.build = {
      ...viteConfig.build,
      rollupOptions: {
        ...rollupOptions,
        onwarn(warning, defaultHandler) {
          // Rollup drops module-level directives during Vite bundling; suppress its noise.
          if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
            return;
          }

          if (existingOnWarn) {
            existingOnWarn(warning, defaultHandler);
          } else {
            defaultHandler(warning);
          }
        },
      },
    };
    viteConfig.plugins = [...(viteConfig.plugins ?? []), tailwindcss()];
    return viteConfig;
  },
};

export default config;
