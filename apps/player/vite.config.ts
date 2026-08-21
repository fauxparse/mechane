import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyEnabled = process.env.VITE_DEV_PROXY === "true" || env.VITE_DEV_PROXY === "true";

  return {
    plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
    server: {
      host: "0.0.0.0",
      hmr: proxyEnabled
        ? {
            clientPort: 443,
            host: "show.mechane.dev",
            protocol: "wss",
          }
        : undefined,
    },
  };
});
