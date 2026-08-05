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
