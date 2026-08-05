import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node",
    // No domain logic exists yet at scaffold time — this flips to false
    // once the first real domain-logic tests land (PRD.md §8 requires them).
    passWithNoTests: true,
  },
});
