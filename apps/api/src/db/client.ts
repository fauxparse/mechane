// Load the API package's environment file even when tests run from the
// repository root. Tests use .env.test so they cannot accidentally connect to
// the developer database. On Vercel, env vars come from the project's
// dashboard settings instead; neither local file is deployed.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

const envFile = process.env.NODE_ENV === "test" ? "../../.env.test" : "../../.env";
config({ path: fileURLToPath(new URL(envFile, import.meta.url)) });

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    const envExample = process.env.NODE_ENV === "test" ? ".env.test.example" : ".env.example";
    throw new Error(
      `DATABASE_URL is not set — copy apps/api/${envExample} to apps/api/${envFile.replace("../../", "")} ` +
        "and run the matching database setup command.",
    );
  }
  return url;
}

const pool = new Pool({ connectionString: requireDatabaseUrl() });

export const db = drizzle(pool, { schema });
