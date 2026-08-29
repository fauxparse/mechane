import { readdir } from "node:fs/promises";

import { sql } from "drizzle-orm";

import { auth } from "../auth";
import { db } from "./client";
import { shows, user } from "./schema";
import type { SeedShow } from "./seeds/utils/seed-utils";

const DEFAULT_USER = {
  name: "Lauren Ipsum",
  email: "test@example.com",
  password: "P4$$w0rd!",
};

function isSeedShow(value: unknown): value is SeedShow {
  if (value === null || typeof value !== "object" || !("name" in value) || !("seed" in value))
    return false;
  return (
    typeof value.name === "string" && value.name.length > 0 && typeof value.seed === "function"
  );
}

async function discoverShowSeeds(): Promise<SeedShow[]> {
  const root = new URL("./seeds/shows/", import.meta.url);
  const entries = await readdir(root, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const seeds: SeedShow[] = [];
  for (const directory of directories) {
    // Show folders are runtime-selected plugins; static imports cannot discover future samples.
    const loaded: unknown = await import(
      new URL(`${directory.name}/${directory.name}.ts`, root).href
    );
    if (
      loaded === null ||
      typeof loaded !== "object" ||
      !("seedShow" in loaded) ||
      !isSeedShow(loaded.seedShow)
    ) {
      throw new Error(`Seed directory "${directory.name}" does not export a valid seedShow.`);
    }
    seeds.push(loaded.seedShow);
  }
  return seeds;
}

async function nukeDatabase(): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE "shows", "user_settings", "account", "session", "verification", "user" RESTART IDENTITY CASCADE`,
  );
}

async function seedDefaultUser(): Promise<string> {
  const { user: createdUser } = await auth.api.signUpEmail({ body: DEFAULT_USER });
  await db
    .update(user)
    .set({ emailVerified: true })
    .where(sql`${user.email} = ${DEFAULT_USER.email}`);
  return createdUser.id;
}

async function seedShows(userId: string, showSeeds: readonly SeedShow[]): Promise<void> {
  for (const seed of showSeeds) {
    const [show] = await db.insert(shows).values({ name: seed.name, userId }).returning();
    if (!show) throw new Error(`Show "${seed.name}" could not be created.`);
    await seed.seed(show.id);
  }
}

async function main(): Promise<void> {
  console.log("Nuking local dev database...");
  await nukeDatabase();

  console.log(`Seeding default user (${DEFAULT_USER.email})...`);
  const userId = await seedDefaultUser();
  const showSeeds = await discoverShowSeeds();

  console.log(`Seeding default Shows for ${DEFAULT_USER.email}...`);
  await seedShows(userId, showSeeds);

  console.log("Done.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
