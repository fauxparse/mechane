// Load the API package's .env even when tests run from the repository root.
// On Vercel, env vars come from the project's dashboard settings instead —
// this is a no-op there since no .env file is deployed (and dotenv never
// overwrites variables that are already set).
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — copy apps/api/.env.example to apps/api/.env " +
        "and run `docker compose up` at the repo root to start local Postgres.",
    );
  }
  return url;
}

const pool = new Pool({ connectionString: requireDatabaseUrl() });

export const db = drizzle(pool, { schema });
