import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
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
});
