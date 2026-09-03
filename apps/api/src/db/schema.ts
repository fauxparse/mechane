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
import { DEFAULT_THEME_PALETTE, generateId } from "@mechane/domain";
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

/** Provider-neutral durable binary identity and lifecycle. */
export const blobs = pgTable("blobs", {
  digest: text("digest").primaryKey(),
  byteLength: integer("byte_length").notNull(),
  mimeType: text("mime_type").notNull(),
  deliveryPath: text("delivery_path").notNull().unique(),
  state: text("state").notNull().default("committed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

/** Show-owned Image Asset metadata; the Blob is immutable and reusable. */
export const imageAssets = pgTable(
  "image_assets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("imageAsset")),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    blobDigest: text("blob_digest")
      .notNull()
      .references(() => blobs.digest),
    revision: text("revision").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    mimeType: text("mime_type").notNull(),
    name: text("name").notNull().default(""),
    alt: text("alt").notNull().default(""),
    blurHash: text("blur_hash"),
    state: text("state").notNull().default("active"),
    sourceAssetId: text("source_asset_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("image_assets_show_idx").on(table.showId),
    unique("image_assets_show_id_unique").on(table.showId, table.id),
    uniqueIndex("image_assets_show_blob_active_idx")
      .on(table.showId, table.blobDigest)
      .where(sql`${table.state} = 'active'`),
    foreignKey({
      name: "image_assets_source_fk",
      columns: [table.showId, table.sourceAssetId],
      foreignColumns: [table.showId, table.id],
    }),
  ],
);

/** Opaque temporary upload/control-plane state; never exposed in domain values. */
export const blobUploadSessions = pgTable(
  "blob_upload_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    state: text("state").notNull().default("active"),
    expiresAt: timestamp("expires_at").notNull(),
    candidateDigest: text("candidate_digest"),
    byteLength: integer("byte_length"),
    declaredMimeType: text("declared_mime_type"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("blob_upload_sessions_user_show_idx").on(table.userId, table.showId)],
);

// Per-account design-system preference (issue #14, PRD.md §7): at most one
// row per user, created on first write (see the `userSettings` resolver in
// apps/api/src/graphql/schema.ts). Values are validated against
// @mechane/domain's `assertValidThemeMode`/`assertValidThemePalette`
// before they reach here, the same way Show names are validated before
// `shows` insert/update — the column types stay plain `text` because the
// set of valid values is a domain concern, not a storage concern (adding a
// theme later shouldn't require a migration).
export const runs = pgTable(
  "runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("run")),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    endedAt: timestamp("ended_at"),
    // A Run owns the live values for its Sources. This starts as a snapshot of
    // the published graph's defaults; explicit Source value edits in the
    // director are synchronized into the active Run immediately.
    sourceValues: jsonb("source_values")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("runs_show_status_idx").on(table.showId, table.status)],
);

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  themeMode: text("theme_mode").notNull().default("dark"),
  themePalette: text("theme_palette").notNull().default(DEFAULT_THEME_PALETTE),
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
  (table) => [
    primaryKey({ columns: [table.graphId, table.id] }),
    unique("shapes_graph_name_unique").on(table.graphId, table.name),
  ],
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
    color: text("color"),
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
    suggestedDimensions: jsonb("suggested_dimensions"),
    rank: text("rank").notNull().default(""),
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
    fieldMapping: jsonb("field_mapping"),
    // Where the author has dragged this edge's runs, keyed by the shape of
    // the route they were placed on (#475). Absent for the overwhelming
    // majority of edges, which route themselves — hence a nullable jsonb
    // rather than columns of its own.
    layout: jsonb("layout"),
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
    // Wiring may target a named Scene Variable or an unnamed Source/Transformer
    // input. Domain validation enforces the target-specific rule.
    check(
      "graph_edges_paths_are_wiring_only",
      sql`${table.kind} = 'wiring' or cardinality(${table.targetPath}) = 0`,
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
// belongs to one draft-or-published state and is reconciled on every save.
// Storing the code on `graph_nodes` would fork it at publish and lose it on
// the next write.
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
    // public identity — the QR, join URL, and code read aloud all carry this
    // one string. Pairing accepts only the code, so it must be globally
    // unique rather than unique within a Show.
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
    // Retired codes stay reserved so an old QR cannot silently pair with a
    // different Device.
    unique("devices_pairing_code_unique").on(table.pairingCode),
    // Database validation mirrors the human-readable pairing alphabet.
    check(
      "devices_pairing_code_is_unambiguous",
      sql`${table.pairingCode} ~ '^[1-9A-HJKMNP-Z]{5}$'`,
    ),
  ],
);

/** Mutable Scene position for one Shared Device within one active Run. */
export const runDeviceStates = pgTable(
  "run_device_states",
  {
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    flowId: text("flow_id").notNull(),
    activeSceneId: text("active_scene_id"),
    publishedGraphVersion: integer("published_graph_version").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.deviceId] }),
    foreignKey({
      name: "run_device_states_device_fk",
      columns: [table.showId, table.deviceId],
      foreignColumns: [devices.showId, devices.id],
    }).onDelete("cascade"),
    index("run_device_states_show_idx").on(table.showId),
  ],
);

/** Idempotent outcomes for authenticated Player Events within a Run. */
export const playerEvents = pgTable(
  "player_events",
  {
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    eventId: text("event_id").notNull(),
    publishedGraphVersion: integer("published_graph_version").notNull(),
    observedSceneId: text("observed_scene_id").notNull(),
    elementId: text("element_id").notNull(),
    eventKind: text("event_kind").notNull(),
    // What was observed, not what matched — this is the audit trail (#459),
    // and which key fired cannot be reconstructed after the fact.
    params: jsonb("params"),
    outcome: text("outcome").notNull(),
    reason: text("reason"),
    resultingSceneId: text("resulting_scene_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.deviceId, table.eventId] }),
    foreignKey({
      name: "player_events_device_fk",
      columns: [table.showId, table.deviceId],
      foreignColumns: [devices.showId, devices.id],
    }).onDelete("cascade"),
  ],
);

/** Durable, invalidation-only delivery work for paired Players. */
export const playerInvalidationOutbox = pgTable(
  "player_invalidation_outbox",
  {
    id: text("id").primaryKey(),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at"),
  },
  (table) => [
    foreignKey({
      name: "player_invalidation_outbox_device_fk",
      columns: [table.showId, table.deviceId],
      foreignColumns: [devices.showId, devices.id],
    }).onDelete("cascade"),
    index("player_invalidation_outbox_ready_idx").on(
      table.status,
      table.nextAttemptAt,
      table.createdAt,
    ),
    index("player_invalidation_outbox_device_order_idx").on(
      table.showId,
      table.deviceId,
      table.createdAt,
      table.id,
    ),
  ],
);
// Blocks are Show-scoped definitions, but their structure belongs to each
// draft/published graph just like Scene Canvases (#136). Block ids are
// client-generated and therefore part of the composite graph key.
export const blocks = pgTable(
  "blocks",
  {
    id: text("id").notNull(),
    graphId: text("graph_id")
      .notNull()
      .references(() => showGraphs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.graphId, table.id] }),
    unique("blocks_graph_name_unique").on(table.graphId, table.name),
  ],
);

// A Canvas belongs to exactly one Scene node or Block definition. Its id is
// separate from its owner because Elements reference the Canvas uniformly.
export const canvases = pgTable(
  "canvases",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("canvas")),
    graphId: text("graph_id")
      .notNull()
      .references(() => showGraphs.id, { onDelete: "cascade" }),
    sceneNodeId: text("scene_node_id"),
    blockId: text("block_id"),
    positionX: doublePrecision("position_x").notNull().default(0),
    positionY: doublePrecision("position_y").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("canvases_graph_idx").on(table.graphId),
    uniqueIndex("canvases_scene_owner_unique").on(table.graphId, table.sceneNodeId),
    uniqueIndex("canvases_block_owner_unique").on(table.graphId, table.blockId),
    foreignKey({
      name: "canvases_scene_owner_fk",
      columns: [table.graphId, table.sceneNodeId],
      foreignColumns: [graphNodes.graphId, graphNodes.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "canvases_block_owner_fk",
      columns: [table.graphId, table.blockId],
      foreignColumns: [blocks.graphId, blocks.id],
    }).onDelete("cascade"),
    check(
      "canvases_exactly_one_owner",
      sql`(${table.sceneNodeId} is not null) <> (${table.blockId} is not null)`,
    ),
  ],
);

// One row per Element. Property structure stays JSONB so adding an authoring
// property does not turn a visual edit into a schema migration; hierarchy,
// identity, and sibling order remain relational constraints.
export const canvasElements = pgTable(
  "canvas_elements",
  {
    id: text("id").notNull(),
    canvasId: text("canvas_id")
      .notNull()
      .references(() => canvases.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    type: text("type").notNull(),
    rank: text("rank").notNull(),
    name: text("name"),
    hidden: boolean("hidden").notNull().default(false),
    properties: jsonb("properties")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.canvasId, table.id] }),
    index("canvas_elements_parent_idx").on(table.canvasId, table.parentId),
    uniqueIndex("canvas_elements_root_unique")
      .on(table.canvasId)
      .where(sql`${table.parentId} is null`),
    foreignKey({
      name: "canvas_elements_parent_fk",
      columns: [table.canvasId, table.parentId],
      foreignColumns: [table.canvasId, table.id],
    }).onDelete("cascade"),
  ],
);
// Interaction definitions are graph-scoped and copied with draft/published
// graph state. Actions are normalized rows so their ownership and order are
// visible to Postgres; Event Bindings point at Canvas Elements.
export const graphCues = pgTable(
  "graph_cues",
  {
    id: text("id").notNull(),
    graphId: text("graph_id")
      .notNull()
      .references(() => showGraphs.id, { onDelete: "cascade" }),
    sceneId: text("scene_id"),
    blockId: text("block_id"),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.graphId, table.id] }),
    unique("graph_cues_scene_name_unique").on(table.graphId, table.sceneId, table.name),
    unique("graph_cues_block_name_unique").on(table.graphId, table.blockId, table.name),
    foreignKey({
      name: "graph_cues_scene_fk",
      columns: [table.graphId, table.sceneId],
      foreignColumns: [graphNodes.graphId, graphNodes.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "graph_cues_block_fk",
      columns: [table.graphId, table.blockId],
      foreignColumns: [blocks.graphId, blocks.id],
    }).onDelete("cascade"),
    check(
      "graph_cues_exactly_one_owner",
      sql`(${table.sceneId} is not null) <> (${table.blockId} is not null)`,
    ),
  ],
);

export const graphActions = pgTable(
  "graph_actions",
  {
    id: text("id").notNull(),
    graphId: text("graph_id")
      .notNull()
      .references(() => showGraphs.id, { onDelete: "cascade" }),
    cueId: text("cue_id").notNull(),
    position: integer("position").notNull(),
    kind: text("kind").notNull(),
    targetSceneId: text("target_scene_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.graphId, table.id] }),
    unique("graph_actions_cue_position_unique").on(table.graphId, table.cueId, table.position),
    foreignKey({
      name: "graph_actions_cue_fk",
      columns: [table.graphId, table.cueId],
      foreignColumns: [graphCues.graphId, graphCues.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "graph_actions_target_scene_fk",
      columns: [table.graphId, table.targetSceneId],
      foreignColumns: [graphNodes.graphId, graphNodes.id],
    }).onDelete("cascade"),
  ],
);

export const graphEventBindings = pgTable(
  "graph_event_bindings",
  {
    id: text("id").notNull(),
    graphId: text("graph_id")
      .notNull()
      .references(() => showGraphs.id, { onDelete: "cascade" }),
    canvasId: text("canvas_id")
      .notNull()
      .references(() => canvases.id, { onDelete: "cascade" }),
    elementId: text("element_id").notNull(),
    eventKind: text("event_kind").notNull(),
    // Per-kind payload. JSONB for the same reason canvas_elements.properties
    // is: a new Event kind's parameters must not be a schema migration. The
    // domain owns what a valid payload is, so there is no CHECK here.
    params: jsonb("params")
      .notNull()
      .default(sql`'{}'::jsonb`),
    cueId: text("cue_id").notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.graphId, table.id] }),
    unique("graph_event_bindings_element_position_unique").on(
      table.graphId,
      table.canvasId,
      table.elementId,
      table.position,
    ),
    foreignKey({
      name: "graph_event_bindings_cue_fk",
      columns: [table.graphId, table.cueId],
      foreignColumns: [graphCues.graphId, graphCues.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "graph_event_bindings_element_fk",
      columns: [table.canvasId, table.elementId],
      foreignColumns: [canvasElements.canvasId, canvasElements.id],
    }).onDelete("cascade"),
  ],
);
