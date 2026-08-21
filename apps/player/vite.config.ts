import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyEnabled = process.env.VITE_DEV_PROXY === "true" || env.VITE_DEV_PROXY === "true";

  return {
    plugins: [react()],
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
