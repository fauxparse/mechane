// Entry point for `pnpm dev:domains` (custom-domains/dev-domains.ts).
import { customDomainsProviderName } from "./custom-domains/provider";
import { runDevDomains } from "./custom-domains/dev-domains";
import { pool } from "./db/client";

try {
  console.log(await runDevDomains(process.argv.slice(2)));
  if (customDomainsProviderName(process.env) !== "local") {
    console.warn("CUSTOM_DOMAINS_PROVIDER isn't local, so the API ignores these overrides.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
