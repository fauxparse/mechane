// Drizzle schema for Better Auth's own tables (user/session/account/verification).
//
// Field/table shapes follow Better Auth's core schema exactly — see
// https://www.better-auth.com/docs/concepts/database#core-schema — so that
// the drizzle adapter can be pointed at this schema with no field mapping.
//
// Application resources (Show, etc.) are added by later tickets. Every such
// table is expected to carry a `userId` column referencing `user.id`, per the
// single-user ownership model (PRD.md §1, §9) — see @mechane/domain's
// `ownership` module for the shared invariant this schema exists to support.
import { generateId } from "@mechane/domain";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// First application resource (issue #3). Every Show belongs to exactly one
// user — see @mechane/domain's `ownership` module, which resolvers use to
// enforce that a user can only see/mutate their own Shows.
//
// The id is a short readable id rather than a UUID (issue #47) because it
// appears in the URL of the Show editor: `generateId` is the same
// generator every URL-visible resource uses, and the column stays `text`
// so there's no migration in the change. Better Auth's tables above keep
// their own id format — they never appear in a URL.
export const shows = pgTable("shows", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId("show")),
  name: text("name").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Per-account design-system preference (issue #14, PRD.md §7): at most one
// row per user, created on first write (see the `userSettings` resolver in
// apps/api/src/graphql/schema.ts). Values are validated against
// @mechane/domain's `assertValidThemeMode`/`assertValidThemePalette`
// before they reach here, the same way Show names are validated before
// `shows` insert/update — the column types stay plain `text` because the
// set of valid values is a domain concern, not a storage concern (adding a
// theme later shouldn't require a migration).
export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  themeMode: text("theme_mode").notNull().default("dark"),
  themePalette: text("theme_palette").notNull().default("slate"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// The Show graph (issue #38) — the unified node graph that is both the
// Scene/Flow state machine and the Show-level wiring graph (PRD.md §6.2).
// Modelled relationally rather than as one JSON blob per Show so the
// structural rules are constraints the database enforces, not just
// comments: an edge physically can't point at a node that isn't there.
//
// The domain model and its invariants live in @mechane/domain's `graph`
// module; every write goes through `assertValidShowGraph` first. The
// constraints here are the backstop for the subset a table can express.

// One row per (Show, state). Draft and published are two independently
// readable graphs for the same Show per ADR-0002 — publishing copies the
// draft's nodes/edges over the published row's, so a Device keeps seeing
// the last published structure while the director edits.
//
// `state` stays plain text for the same reason `user_settings.theme_mode`
// does: the valid set is a domain concern (@mechane/domain's
// `assertValidGraphState`), not a storage one.
export const showGraphs = pgTable(
  "show_graphs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("graph")),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    state: text("state").notNull(),
    // How many times this graph has been written, and the whole of optimistic
    // concurrency for it (#103): an edit batch names the version it was
    // composed against, and a batch whose base has moved is refused rather
    // than applied over the top of whatever moved it. Wholesale replacement
    // had nothing to check, which is exactly what made it last-write-wins.
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [unique("show_graphs_show_state_unique").on(table.showId, table.state)],
);

// Shape definitions are graph-scoped type-system data, not graph nodes. Keeping
// them beside each graph state gives draft and published Shapes the same
// isolation as nodes and edges (#106).
export const shapes = pgTable(
  "shapes",
  {
    id: text("id").notNull(),
    graphId: text("graph_id")
      .notNull()
      .references(() => showGraphs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (table) => [primaryKey({ columns: [table.graphId, table.id] }), unique("shapes_graph_name_unique").on(table.graphId, table.name)],
);

export const shapeFields = pgTable(
  "shape_fields",
  {
    id: text("id").notNull(),
    graphId: text("graph_id")
      .notNull()
      .references(() => showGraphs.id, { onDelete: "cascade" }),
    shapeId: text("shape_id").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    type: jsonb("type").notNull(),
    required: boolean("required").notNull(),
    defaultValue: jsonb("default_value"),
  },
  (table) => [
    primaryKey({ columns: [table.graphId, table.id] }),
    unique("shape_fields_graph_shape_name_unique").on(table.graphId, table.shapeId, table.name),
    foreignKey({
      name: "shape_fields_shape_fk",
      columns: [table.graphId, table.shapeId],
      foreignColumns: [shapes.graphId, shapes.id],
    }).onDelete("cascade"),
  ],
);

// A separate reference table makes Shape references inside nested array types
// visible to the database and gives the domain's topological validation a
// compact relational input (#93).
export const shapeFieldRefs = pgTable(
  "shape_field_refs",
  {
    graphId: text("graph_id")
      .notNull()
      .references(() => showGraphs.id, { onDelete: "cascade" }),
    fieldId: text("field_id").notNull(),
    referencedShapeId: text("referenced_shape_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.graphId, table.fieldId, table.referencedShapeId] }),
    foreignKey({
      name: "shape_field_refs_field_fk",
      columns: [table.graphId, table.fieldId],
      foreignColumns: [shapeFields.graphId, shapeFields.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "shape_field_refs_shape_fk",
      columns: [table.graphId, table.referencedShapeId],
      foreignColumns: [shapes.graphId, shapes.id],
    }).onDelete("cascade"),
  ],
);

// The five node kinds (#20) in one table: they share every structural
// field (identity, name, placement, position) and differ only in which
// edges may touch them, which is an edge-side rule. `kind` stays text, as
// above.
//
// Keyed by (graph, node) rather than node alone: publishing copies the
// draft's nodes into the published graph *keeping their ids*, so a node
// id means the same thing in both states — and every foreign key below is
// composite, which makes an edge that joins two different graphs
// unrepresentable rather than merely unlikely.
//
// `parent_id` is the *entire* representation of both Scene nesting and
// Flow-local placement (#29) — deliberately no `flow_local` column. The
// check constraints below are where "no Flow-in-Flow" (#23) and "Devices
// are Show-level peers" (#26) stop being conventions.
export const graphNodes = pgTable(
  "graph_nodes",
  {
    id: text("id").notNull(),
    graphId: text("graph_id")
      .notNull()
      .references(() => showGraphs.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    // The containing Flow, or null for a Show-level node.
    parentId: text("parent_id"),
    // Flow nodes only: the design-time entry Scene (#23). Deliberately not
    // a foreign key: the only available composite-FK delete behaviours are
    // cascade (a Flow shouldn't die with its default Scene) and no action
    // (which would block deleting that Scene) — neither is the rule, which
    // is "the Flow survives with no default". @mechane/domain's
    // `assertValidShowGraph` is what keeps this pointing at a Scene of
    // this Flow.
    defaultSceneId: text("default_scene_id"),
    type: jsonb("type"),
    positionX: doublePrecision("position_x").notNull().default(0),
    positionY: doublePrecision("position_y").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.graphId, table.id] }),
    index("graph_nodes_parent_idx").on(table.graphId, table.parentId),
    // Self-referencing: the parent must be a real node *in the same graph*,
    // and deleting a Flow takes its contents with it (#27's cascade).
    foreignKey({
      name: "graph_nodes_parent_fk",
      columns: [table.graphId, table.parentId],
      foreignColumns: [table.graphId, table.id],
    }).onDelete("cascade"),
    // No Flow-in-Flow (#23), and no Device inside a Flow (#26).
    check(
      "graph_nodes_no_nested_containers",
      sql`${table.kind} not in ('flow', 'device') or ${table.parentId} is null`,
    ),
    // Only a Flow has a default Scene.
    check(
      "graph_nodes_default_scene_is_flow_only",
      sql`${table.kind} = 'flow' or ${table.defaultSceneId} is null`,
    ),
  ],
);

export const sourceFieldDefaults = pgTable(
  "source_field_defaults",
  {
    graphId: text("graph_id")
      .notNull()
      .references(() => showGraphs.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    fieldPath: text("field_path").array().notNull(),
    value: jsonb("value"),
  },
  (table) => [
    primaryKey({ columns: [table.graphId, table.nodeId, table.fieldPath] }),
    foreignKey({
      name: "source_field_defaults_node_fk",
      columns: [table.graphId, table.nodeId],
      foreignColumns: [graphNodes.graphId, graphNodes.id],
    }).onDelete("cascade"),
  ],
);


// A Variable is a port on a Scene, not a node of its own (#20) — so it
// lives in its own table keyed to a Scene node, and a wiring edge points
// at a row here rather than at the Scene generally.
export const graphNodeVariables = pgTable(
  "graph_node_variables",
  {
    id: text("id").notNull(),
    graphId: text("graph_id")
      .notNull()
      .references(() => showGraphs.id, { onDelete: "cascade" }),
    sceneId: text("scene_id").notNull(),
    name: text("name").notNull(),
    type: jsonb("type"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.graphId, table.id] }),
    foreignKey({
      name: "graph_node_variables_scene_fk",
      columns: [table.graphId, table.sceneId],
      foreignColumns: [graphNodes.graphId, graphNodes.id],
    }).onDelete("cascade"),
    unique("graph_node_variables_scene_name_unique").on(table.graphId, table.sceneId, table.name),
  ],
);

// The three edge kinds (#20, direction corrected by #26), all running
// producer → consumer, in one table:
//
//   wiring    Source | Transformer → Transformer input or Scene Variable
//   navigate  Scene                  → Scene           (same Flow, #25)
//   device    Flow | top-level Scene → Device
//
// A wiring edge addresses a value at each end by path, so it can carry one
// field of a structured Source into one field of a Scene Variable rather
// than only whole values. `target_variable_id` is therefore *derived*: it's
// a stored generated column holding `target_path[1]`, which is what lets
// the foreign key below still guarantee that the Variable a wiring edge
// lands on exists (#20) even though the column is no longer written
// directly.
//
// Which node kinds may sit at each end is checked in @mechane/domain — it
// needs both endpoints' rows, which a row-level check can't see. What the
// table does enforce is that only a wiring edge addresses values, that only
// a Navigate edge carries a Cue/Action pairing, and that an edge is never
// duplicated: parallel Navigate edges between the same two Scenes are
// allowed (one per distinct pairing, #20), as are parallel wiring edges
// moving different fields.
export const graphEdges = pgTable(
  "graph_edges",
  {
    id: text("id").notNull(),
    graphId: text("graph_id")
      .notNull()
      .references(() => showGraphs.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    sourceNodeId: text("source_node_id").notNull(),
    targetNodeId: text("target_node_id").notNull(),
    // Field paths into the producer's and consumer's values, outermost
    // segment first; empty means "the whole value", and both are empty on
    // Navigate and Device edges, which don't address values at all.
    sourcePath: text("source_path")
      .array()
      .notNull()
      .default(sql`'{}'`),
    targetPath: text("target_path")
      .array()
      .notNull()
      .default(sql`'{}'`),
    // The head of `target_path` — the Scene Variable a wiring edge lands
    // on. Generated rather than written so it can't disagree with the path
    // it comes from, while still being a real column the foreign key below
    // can point at.
    targetVariableId: text("target_variable_id").generatedAlwaysAs(sql`target_path[1]`),
    // Cues and Actions aren't modelled yet, so these are opaque ids with no
    // FK — they exist now because the pairing is what makes parallel
    // Navigate edges distinguishable, and retrofitting that into the
    // uniqueness rule later would mean rewriting existing rows.
    cueId: text("cue_id"),
    actionId: text("action_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.graphId, table.id] }),
    index("graph_edges_source_idx").on(table.graphId, table.sourceNodeId),
    index("graph_edges_target_idx").on(table.graphId, table.targetNodeId),
    foreignKey({
      name: "graph_edges_source_fk",
      columns: [table.graphId, table.sourceNodeId],
      foreignColumns: [graphNodes.graphId, graphNodes.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "graph_edges_target_fk",
      columns: [table.graphId, table.targetNodeId],
      foreignColumns: [graphNodes.graphId, graphNodes.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "graph_edges_target_variable_fk",
      columns: [table.graphId, table.targetVariableId],
      foreignColumns: [graphNodeVariables.graphId, graphNodeVariables.id],
    }).onDelete("cascade"),
    // Coalesced because Postgres treats NULLs as distinct, which would let
    // two identical Navigate edges with no Cue coexist.
    uniqueIndex("graph_edges_no_duplicates").on(
      table.graphId,
      table.kind,
      table.sourceNodeId,
      table.targetNodeId,
      // The arrays index directly (btree compares text[] fine) — joining
      // them into a string would need `array_to_string`, which is only
      // STABLE, and an index expression has to be IMMUTABLE.
      table.sourcePath,
      table.targetPath,
      sql`coalesce(${table.cueId}, '')`,
      sql`coalesce(${table.actionId}, '')`,
    ),
    // Only a wiring edge addresses a value, and it must name at least the
    // Scene Variable it feeds.
    check(
      "graph_edges_paths_are_wiring_only",
      sql`(${table.kind} = 'wiring') = (cardinality(${table.targetPath}) > 0)`,
    ),
    check(
      "graph_edges_source_path_is_wiring_only",
      sql`${table.kind} = 'wiring' or cardinality(${table.sourcePath}) = 0`,
    ),
    // Only a Navigate edge means anything by a Cue/Action pairing.
    check(
      "graph_edges_pairing_is_navigate_only",
      sql`${table.kind} = 'navigate' or (${table.cueId} is null and ${table.actionId} is null)`,
    ),
  ],
);

// A Device's identity (issue #45), which is a *Show*-level thing and so
// deliberately not a graph table: a pairing code is stable at the Show
// level and persists across every Run (PRD.md §4.3), while a graph row
// belongs to one draft-or-published state and is rewritten wholesale on
// every save. Storing the code on `graph_nodes` would fork it at publish
// and lose it on the next write.
//
// A row's `id` *is* the id of the Device node that owns it. Node ids are
// generated client-side (#47) and copied verbatim by publish, so they are
// already the stable, cross-state name for "this Device" — a separate
// `device_id` column would only be a second name for the same thing.
// That's also what makes undo safe: undoing and redoing a Device's
// creation restores the same node id, so it finds the same row and the
// same code, rather than invalidating a QR already printed in a programme.
export const devices = pgTable(
  "devices",
  {
    id: text("id").notNull(),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    // The code a physical device pairs with (#8), and the Device's whole
    // public identity — the QR, the join URL and the code read aloud are
    // all this one string. Five characters from an alphabet with no
    // look-alikes (see `CODE_ALPHABET` in ./devices), unique within the
    // Show, minted server-side because a client can't check uniqueness.
    pairingCode: text("pairing_code").notNull(),
    // How many logical instances this Device is — see `DeviceNode` in
    // @mechane/domain. Fixed at creation: it decides Event attribution,
    // and flipping it would silently rewrite what existing edges mean.
    perConnection: boolean("per_connection").notNull().default(false),
    // Set when no graph state references this Device any more. Retirement
    // happens at publish, never at draft-edit time: a director deleting a
    // node from the draft must not drop a Device that a live Run is still
    // serving (ADR-0002).
    retiredAt: timestamp("retired_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.showId, table.id] }),
    // Codes only need to be unique within the Show that resolves them —
    // a joining device supplies the Show's identity along with the code.
    // Retired codes stay in the index so a retired Device's code isn't
    // recycled onto a different Device while the old QR is still out
    // there in the world.
    unique("devices_pairing_code_unique").on(table.showId, table.pairingCode),
    // The alphabet, restated as a constraint: A-Z and 1-9, less I, L and O
    // (and 0), so a stored code can't be one a human would mistype.
    check(
      "devices_pairing_code_is_unambiguous",
      sql`${table.pairingCode} ~ '^[1-9A-HJKMNP-Z]{5}$'`,
    ),
  ],
);
