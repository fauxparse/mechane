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

  // The Formula editor is already a React.lazy chunk; the detector cannot trace
  // that boundary through the design-system package. Keep the finding in local
  // scans, but do not repeat this known false positive in PR comments.
  surfaces: {
    prComment: {
      excludeRules: ["react-doctor/prefer-dynamic-import"],
    },
  },

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
      {
        // FormulaCodeEditor *is* the lazy chunk this rule asks for:
        // FormulaEditor.tsx loads it through React.lazy, and a studio build
        // emits CodeMirror in its own FormulaCodeEditor-*.js chunk, absent from
        // the entry bundle. The rule only sees the static imports inside that
        // already-split chunk (#687).
        files: ["src/editors/show/graph/formula/FormulaCodeEditor.tsx"],
        rules: ["react-doctor/prefer-dynamic-import"],
      },
    ],
  },

  rules: {
    "react-doctor/click-events-have-key-events": "off",
    "react-doctor/no-autofocus": "off",
    "react-doctor/no-noninteractive-element-interactions": "off",
    "react-doctor/no-array-index-as-key": "off",
  },
} satisfies ReactDoctorConfig;
