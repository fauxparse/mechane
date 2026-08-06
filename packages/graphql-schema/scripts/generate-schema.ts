// Regenerates `schema.graphql` — the checked-in SDL snapshot of apps/api's
// schema — by importing apps/api's schema module directly and running
// `printSchema` on it (issue #15). apps/api defines its schema as an inline
// SDL string via graphql-yoga's `createSchema` (not a `.graphql` file), so
// this is the only source of truth; gql.tada's TS plugin then generates its
// own schema-types file (`src/graphql-env.d.ts`) from the SDL this writes.
//
// No live server or database is needed: importing the schema module
// transitively imports apps/api/src/db/client.ts, which eagerly constructs a
// `pg.Pool` (but never queries it here) and apps/api/src/auth.ts, which
// configures Better Auth (but never calls out anywhere). Both just need
// *some* value in their environment variables to avoid throwing at import
// time, so placeholders are supplied unless real ones are already set (e.g.
// via a local apps/api/.env picked up by dotenv).
//
// Run via `pnpm codegen` (root) or `pnpm --filter @presence/graphql-schema
// codegen`. CI re-runs this and fails the build on any resulting git diff
// (.github/workflows/ci.yml) so `schema.graphql` and the gql.tada
// schema-types file can never silently drift from the live schema.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.env.DATABASE_URL ??= "postgres://codegen:codegen@localhost:5432/codegen";
process.env.BETTER_AUTH_SECRET ??= "codegen-placeholder-secret-not-for-real-use-00000000";
process.env.BETTER_AUTH_URL ??= "http://localhost:4000";

const { printSchema } = await import("graphql");
const { schema } = await import("../../../apps/api/src/graphql/schema.ts");

const outputPath = fileURLToPath(new URL("../schema.graphql", import.meta.url));
const sdl = `${printSchema(schema).trimEnd()}\n`;

writeFileSync(outputPath, sdl, "utf8");

console.log(`Wrote ${outputPath}`);
