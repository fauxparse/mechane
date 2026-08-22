// `pnpm db:seed` — wipes local dev data and recreates a default account to
// develop/log in against. Truncates rather than dropping tables so it can
// be re-run freely against a database whose schema is already migrated
// (`pnpm db:push` / `db:migrate`).
//
// User creation goes through Better Auth's own `signUpEmail` API (not a
// raw insert) so the password is hashed exactly the way sign-in expects —
// the hashing scheme is Better Auth's internal concern, not something this
// script should reimplement.
import { and, eq, sql } from "drizzle-orm";

import { auth } from "../auth";
import { db } from "./client";
import { readCanvasWorkspace, writeCanvasRows } from "./canvas";
import { SEED_CANVASES, SEED_GRAPHS, seedCanvasPosition } from "./seed-graphs";
import type { SeedCanvases, SeedGraph } from "./seed-graphs";
import { showGraphs, shows, user } from "./schema";
// `TRUNCATE ... CASCADE` on `shows` takes the graph tables with it, so they
// don't need naming in the truncate list below.
import { publishShowGraph, writeShowGraph } from "./show-graph";
// user_settings deliberately isn't truncated with a row inserted here: an
// absent row is the "using defaults" state the app already handles (see
// the `userSettings` resolver), so seed data doesn't need to fabricate one.

const DEFAULT_USER = {
  name: "Lauren Ipsum",
  email: "test@example.com",
  password: "P4$$w0rd!",
};

// New resource types should be visible in the single local demo Show rather
// than hidden behind a collection of unrelated examples.
const DEFAULT_SHOW_NAMES = ["Voting demo"];

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
async function assertSeedCanvases(
  showId: string,
  state: "draft" | "published",
  graph: SeedGraph,
): Promise<void> {
  const expectedSceneIds = new Set(
    graph.nodes.filter((node) => node.kind === "scene").map((node) => node.id),
  );
  const actualSceneIds = new Set(
    (await readCanvasWorkspace(showId, state)).canvases
      .filter((canvas) => canvas.kind === "scene")
      .map((canvas) => canvas.ownerId),
  );
  const missing = [...expectedSceneIds].filter((sceneId) => !actualSceneIds.has(sceneId));
  if (missing.length > 0) {
    throw new Error(`Seeded ${state} graph is missing Canvases for Scenes: ${missing.join(", ")}`);
  }
}

async function seedCanvases(
  showId: string,
  state: "draft" | "published",
  graph: SeedGraph,
  canvases: SeedCanvases,
): Promise<void> {
  const [graphRow] = await db
    .select({ id: showGraphs.id })
    .from(showGraphs)
    .where(and(eq(showGraphs.showId, showId), eq(showGraphs.state, state)));
  if (!graphRow) throw new Error(`Seeded ${state} graph for Show "${showId}" was not found.`);
  await db.transaction(async (tx) => {
    const now = new Date();
    for (const [index, [sceneId, canvas]] of Object.entries(canvases).entries()) {
      const scene = graph.nodes.find((node) => node.id === sceneId && node.kind === "scene");
      if (!scene || scene.kind !== "scene")
        throw new Error(`Seed canvas "${sceneId}" has no Scene node.`);
      await writeCanvasRows(
        tx,
        showId,
        graphRow.id,
        { sceneNodeId: sceneId },
        canvas,
        now,
        seedCanvasPosition(index),
      );
    }
  });
}

async function seedDefaultShows(userId: string): Promise<void> {
  const created = await db
    .insert(shows)
    .values(DEFAULT_SHOW_NAMES.map((name) => ({ name, userId })))
    .returning();

  for (const show of created) {
    const buildGraph = SEED_GRAPHS[show.name];
    const buildCanvases = SEED_CANVASES[show.name];
    if (!buildGraph || !buildCanvases) continue;
    const graph = buildGraph();
    await writeShowGraph(show.id, "draft", graph);
    await seedCanvases(show.id, "draft", graph, buildCanvases());
    await assertSeedCanvases(show.id, "draft", graph);
    await publishShowGraph(show.id);
    await seedCanvases(show.id, "published", graph, buildCanvases());
    await assertSeedCanvases(show.id, "published", graph);
  }
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
