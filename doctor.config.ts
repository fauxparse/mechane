// React Doctor (issue #69) — deterministic React quality scan, run by agents
// and in CI. See AGENTS.md § React code quality.
//
// Docs: https://react.doctor/docs/configuration/config-files
// Prefer `pnpm react-doctor rules explain <rule>` over guessing at a rule's intent,
// and `pnpm react-doctor rules disable <rule>` over hand-editing this file.
// Typed via `satisfies` rather than react-doctor's `defineConfig`: that helper
// lives on the `react-doctor/api` subpath, and importing it for real makes the
// CLI's config loader fail. A type-only import is erased, so this stays typed
// without loading anything at runtime.
import type { ReactDoctorConfig } from "react-doctor/api";

export default {
  // The three React workspaces. `apps/api`, `packages/commands`,
  // `packages/domain`, `packages/graphql-schema` and `packages/realtime` hold
  // no React, so scanning them only produces noise.
  projects: ["@mechane/studio", "@mechane/player", "@mechane/design-system"],

  // Advisory locally and in CI for now: findings are reported, nothing is
  // gated. Tighten to "error" once we trust the signal (issue #69).
  blocking: "none",

  // The CLI reports run traces and anonymous usage counters to Sentry by
  // default; opt out.
  noScore: true,

  ignore: {
    files: [
      "**/routeTree.gen.ts",
      "**/graphql-env.d.ts",
      "**/schema.graphql",
      "**/dist/**",
      "**/storybook-static/**",
    ],

    overrides: [
      {
        files: ["src/components/ui/**"],
        rules: ["react-doctor/only-export-components"],
      },
    ],
  },

  rules: {
    "react-doctor/no-autofocus": "off",
  },
} satisfies ReactDoctorConfig;
