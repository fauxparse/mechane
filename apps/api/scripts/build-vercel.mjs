import { build } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputRoot = resolve(".vercel/output");
const functionRoot = resolve(outputRoot, "functions/api.func");
const functionFile = resolve(functionRoot, "index.mjs");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(functionRoot, { recursive: true });

await build({
  bundle: true,
  entryPoints: ["src/vercel-entry.ts"],
  external: ["pg-native", "bufferutil", "utf-8-validate"],
  format: "esm",
  outfile: functionFile,
  platform: "node",
  sourcemap: false,
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});

await writeFile(
  resolve(functionRoot, ".vc-config.json"),
  `${JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
    },
    null,
    2,
  )}\n`,
);
await writeFile(
  resolve(outputRoot, "config.json"),
  `${JSON.stringify(
    {
      version: 3,
      routes: [{ src: "/api/(.*)", dest: "/api" }],
      crons: [
        {
          path: "/api/cron/player-invalidations",
          schedule: process.env.CRON_SCHEDULE ?? "0 4 * * *",
        },
      ],
    },
    null,
    2,
  )}\n`,
);

console.log(`Vercel function written to ${functionFile}`);
