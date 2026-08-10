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
