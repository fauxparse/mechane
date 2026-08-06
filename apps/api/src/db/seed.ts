// `pnpm db:seed` — wipes local dev data and recreates a default account to
// develop/log in against. Truncates rather than dropping tables so it can
// be re-run freely against a database whose schema is already migrated
// (`pnpm db:push` / `db:migrate`).
//
// User creation goes through Better Auth's own `signUpEmail` API (not a
// raw insert) so the password is hashed exactly the way sign-in expects —
// the hashing scheme is Better Auth's internal concern, not something this
// script should reimplement.
import { sql } from "drizzle-orm";

import { auth } from "../auth";
import { db } from "./client";
import { shows, user } from "./schema";
// user_settings deliberately isn't truncated with a row inserted here: an
// absent row is the "using defaults" state the app already handles (see
// the `userSettings` resolver), so seed data doesn't need to fabricate one.

const DEFAULT_USER = {
  name: "Lauren Ipsum",
  email: "test@example.com",
  password: "P4$$w0rd!",
};

// New resource types added by later tickets should extend this list rather
// than adding their own separate seed script, per the project rule that new
// functionality ships with seed data so the app is immediately testable.
const DEFAULT_SHOW_NAMES = ["Hamlet", "A Midsummer Night's Dream"];

async function nukeDatabase(): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE "shows", "user_settings", "account", "session", "verification", "user" RESTART IDENTITY CASCADE`,
  );
}

async function seedDefaultUser(): Promise<string> {
  const { user: createdUser } = await auth.api.signUpEmail({ body: DEFAULT_USER });
  // Seed data should be immediately usable for local dev/testing — skip the
  // "click the verification link" step rather than wiring up real email.
  await db
    .update(user)
    .set({ emailVerified: true })
    .where(sql`${user.email} = ${DEFAULT_USER.email}`);
  return createdUser.id;
}

async function seedDefaultShows(userId: string): Promise<void> {
  await db.insert(shows).values(DEFAULT_SHOW_NAMES.map((name) => ({ name, userId })));
}

async function main(): Promise<void> {
  console.log("Nuking local dev database...");
  await nukeDatabase();

  console.log(`Seeding default user (${DEFAULT_USER.email})...`);
  const userId = await seedDefaultUser();

  console.log(`Seeding default Shows for ${DEFAULT_USER.email}...`);
  await seedDefaultShows(userId);

  console.log("Done.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
