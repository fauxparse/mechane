import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyEnabled = process.env.VITE_DEV_PROXY === "true" || env.VITE_DEV_PROXY === "true";

  return {
    plugins: [
      // Must come before react() — it rewrites the route files before the
      // React plugin transforms them. Generates src/routeTree.gen.ts from
      // src/routes/ (issue #32); that file is committed, so typecheck and CI
      // don't need to run Vite first.
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@studio": path.resolve(__dirname, "./src"),
        "@show-editor": path.resolve(__dirname, "./src/editors/show"),
        "@canvas-editor": path.resolve(__dirname, "./src/editors/canvas"),
      },
    },
    server: {
      host: "0.0.0.0",
      hmr: proxyEnabled
        ? {
            clientPort: 443,
            host: "studio.mechane.dev",
            protocol: "wss",
          }
        : undefined,
    },
  };
});
