// GraphQL schema. `me` proves a signed-in user is resolvable in the
// resolver layer; the Show query/mutations (issue #3) are the first real
// owned-resource vertical slice, using `requireUserId` (./context.ts) and
// `assertOwnedBy`/`assertValidShowName` (@mechane/domain) the same way
// every later owned resource (Scene, Device, ...) should.
import {
  InvalidReparentError,
  UnknownGraphEditError,
  UnknownGraphTargetError,
} from "@mechane/commands";
import type { GraphEdit } from "@mechane/commands";
import {
  assertOwnedBy,
  assertValidGraphState,
  assertValidShowName,
  assertValidThemeMode,
  assertValidThemePalette,
  defaultThemeSettings,
  InvalidGraphStateError,
  InvalidShowGraphError,
  InvalidShowNameError,
  isId,
  InvalidThemeModeError,
  InvalidThemePaletteError,
} from "@mechane/domain";
import type { GraphState } from "@mechane/domain";
import { and, eq } from "drizzle-orm";
import { GraphQLError } from "graphql";
import { createSchema } from "graphql-yoga";

import { db } from "../db/client";
import { withUniqueId } from "../db/ids";
import { shows, userSettings } from "../db/schema";
import {
  applyShowGraphEdits,
  GraphVersionConflictError,
  publishShowGraph,
  readShowGraph,
} from "../db/show-graph";
import { requireUserId } from "./context";
import type { GraphQLContext } from "./context";
import { parseGraphEdit, serializeAppliedEdits, serializeShowGraph } from "./show-graph";
import type { GraphEditInput } from "./show-graph";

// graphql-yoga masks any thrown error that isn't a GraphQLError as a generic
// "Unexpected error" (sound default — it stops internal error messages
// leaking to clients). @mechane/domain's validation errors are plain
// Errors so they stay usable outside a GraphQL context, so translate them
// here into a GraphQLError the client can actually read.
function validShowName(name: string): string {
  try {
    return assertValidShowName(name);
  } catch (error) {
    if (error instanceof InvalidShowNameError) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
    }
    throw error;
  }
}

// Mirrors `validShowName` above: @mechane/domain's validators are plain
// Errors so they stay usable outside a GraphQL context, so translate them
// into a GraphQLError the client can read rather than the generic
// "Unexpected error" graphql-yoga masks non-GraphQLErrors as.
function validThemeMode(value: string): string {
  try {
    return assertValidThemeMode(value);
  } catch (error) {
    if (error instanceof InvalidThemeModeError) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
    }
    throw error;
  }
}

function validThemePalette(value: string): string {
  try {
    return assertValidThemePalette(value);
  } catch (error) {
    if (error instanceof InvalidThemePaletteError) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
    }
    throw error;
  }
}

// Same translation again, for the two Show-graph domain errors (#38).
function validGraphState(value: string): GraphState {
  try {
    return assertValidGraphState(value);
  } catch (error) {
    if (error instanceof InvalidGraphStateError) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
    }
    throw error;
  }
}

// The three ways an edit batch can be refused, each translated from a plain
// Error into something the client can actually read and act on. CONFLICT is
// the one that's new (#103): it means "re-read the draft and try again",
// which is a different instruction from "this batch was nonsense".
async function applyEdits(showId: string, baseVersion: number, edits: GraphEdit[]) {
  try {
    return await applyShowGraphEdits(showId, edits, baseVersion);
  } catch (error) {
    if (error instanceof GraphVersionConflictError) {
      throw new GraphQLError(error.message, { extensions: { code: "CONFLICT" } });
    }
    // An edit naming a node that isn't there, an illegal structural move, or
    // a type this server doesn't know: all of them mean the batch was built
    // against a graph this server doesn't have, and none of them is a bug in
    // the server.
    if (
      error instanceof InvalidShowGraphError ||
      error instanceof UnknownGraphTargetError ||
      error instanceof UnknownGraphEditError ||
      error instanceof InvalidReparentError
    ) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
    }
    throw error;
  }
}

async function findOwnShowOrThrow(id: string, userId: string) {
  // A malformed id can't match any row, so don't ask the database — but
  // report it the same way a missing row is reported, since telling the
  // client "that's not even a valid Show id" is information about the id
  // format they don't need from a mutation.
  if (!isId("show", id)) {
    throw new GraphQLError("Show not found.", { extensions: { code: "NOT_FOUND" } });
  }
  const [show] = await db.select().from(shows).where(eq(shows.id, id));
  if (!show) {
    throw new GraphQLError("Show not found.", { extensions: { code: "NOT_FOUND" } });
  }
  // assertOwnedBy throws NotOwnerError, which reads as "not found" to the
  // caller rather than confirming a Show with this id exists for someone
  // else — a user must not be able to see or mutate another user's Shows.
  try {
    return assertOwnedBy(show, userId);
  } catch {
    throw new GraphQLError("Show not found.", { extensions: { code: "NOT_FOUND" } });
  }
}

export const schema = createSchema<GraphQLContext>({
  typeDefs: /* GraphQL */ `
    type User {
      id: ID!
      name: String!
      email: String!
      emailVerified: Boolean!
    }

    type Show {
      id: ID!
      name: String!
      createdAt: String!
      updatedAt: String!
    }

    "The signed-in user's design-system preference (PRD.md §7)."
    type UserSettings {
      "Display mode: \\"light\\" or \\"dark\\"."
      themeMode: String!
      "Which built-in theme is active: \\"slate\\" or \\"gruvbox\\"."
      themePalette: String!
    }

    "Free-form canvas coordinates for a graph node (issue #25 — no auto-layout)."
    type Position {
      x: Float!
      y: Float!
    }

    "A named port on a Scene. A wiring edge targets one of these, not the Scene as a whole."
    type SceneVariable {
      id: ID!
      name: String!
    }

    """
    A node in the Show graph. One flat shape for all five kinds: \`kind\` is
    "scene", "flow", "source", "transformer", or "device".
    """
    type GraphNode {
      id: ID!
      kind: String!
      name: String!
      "The Flow containing this node, or null if it's Show-level. This is also what makes a Source Flow-local."
      parentId: ID
      "Flow nodes only: the Flow's design-time entry Scene, if one is set."
      defaultSceneId: ID
      position: Position!
      "Scene nodes only: the Variables wiring edges can target."
      variables: [SceneVariable!]!
      """
      Device nodes only: whether this Device is one logical instance per
      connection (an Audience Device, each phone independent) rather than
      one shared instance every connection sees alike. False for every
      other kind of node.
      """
      perConnection: Boolean!
      """
      Device nodes only: the Show-level pairing code a physical device
      joins with. Null until the server has minted one, which happens the
      first time the graph is saved.
      """
      pairingCode: String
    }

    """
    An edge in the Show graph, always running producer → consumer. \`kind\` is
    "wiring" (Source/Transformer → Transformer input or Scene Variable), "navigate" (Scene → Scene
    within one Flow), or "device" (Flow/top-level Scene → Device).
    """
    type GraphEdge {
      id: ID!
      kind: String!
      sourceId: ID!
      targetId: ID!
      """
      Wiring edges only: which field of the producer's value travels down
      this edge, outermost segment first. Empty means the whole value.
      """
      sourcePath: [String!]!
      """
      Wiring edges only: which part of the consumer this edge feeds. The
      first segment is the Scene Variable's id; any further segments name a
      field within it, so one field of a structured Variable can be fed
      without disturbing its siblings.
      """
      targetPath: [String!]!
      "Wiring edges only: the Scene Variable this edge feeds — the head of targetPath."
      targetVariableId: ID
      "Navigate edges only: which Cue/Action pairing this transition represents."
      cueId: ID
      actionId: ID
    }

    "A Show's graph in one state. Draft and published are independently readable (ADR-0002)."
    type ShowGraph {
      showId: ID!
      "Either \\"draft\\" or \\"published\\"."
      state: String!
      nodes: [GraphNode!]!
      edges: [GraphEdge!]!
      updatedAt: String!
      """
      How many times this graph has been written. An edit batch names the
      version it was composed against, and is refused if that isn't the
      version stored — see \`applyShowGraphEdits\`.
      """
      version: Int!
    }

    input PositionInput {
      x: Float!
      y: Float!
    }

    input SceneVariableInput {
      id: ID!
      name: String!
    }

    input GraphNodeInput {
      id: ID!
      kind: String!
      name: String!
      parentId: ID
      defaultSceneId: ID
      position: PositionInput!
      variables: [SceneVariableInput!]
      """
      Device nodes only: whether each connection is its own instance.
      Defaults to false, and is only read when the Device is new — it is
      fixed at creation, so a later change is ignored rather than obeyed.
      There is no pairingCode input: codes are minted server-side.
      """
      perConnection: Boolean
    }

    input GraphEdgeInput {
      id: ID!
      kind: String!
      sourceId: ID!
      targetId: ID!
      "Defaults to the empty path (the whole value)."
      sourcePath: [String!]
      "Wiring edges must give at least the Scene Variable's id. Defaults to empty."
      targetPath: [String!]
      cueId: ID
      actionId: ID
    }

    """
    One edit on its way out (issue #111): the same shape as
    \`GraphEditInput\`, plus \`pairingCode\`, which only ever travels in this
    direction. What the server tells a client about a change it didn't make
    is the same vocabulary a realtime channel will use for a change someone
    else made (ADR-0003).
    """
    type GraphEdit {
      type: String!
      nodeId: ID
      node: GraphNode
      edgeId: ID
      edge: GraphEdge
      position: Position
      parentId: ID
      name: String
      flowId: ID
      sceneId: ID
      variableId: ID
      variable: SceneVariable
      "Devices only: the code the server minted for a Device this batch created (#45)."
      pairingCode: String
    }

    """
    The answer to an edit batch (issue #111) — deliberately not the graph.

    The client composed these edits against its own copy and applied them
    locally before sending, so the only things it is missing are the version
    to build the next batch on and whatever the server decided that it
    couldn't. Returning the whole graph here would be the wholesale
    replacement issue #103 removed, pointed the other way.
    """
    type AppliedShowGraphEdits {
      showId: ID!
      "Either \\"draft\\" or \\"published\\"."
      state: String!
      "The draft's new timestamp — what the \\"unpublished changes\\" badge compares (ADR-0002)."
      updatedAt: String!
      "The version the next batch must be composed against."
      version: Int!
      """
      Edits the server made that the client didn't ask for. Apply them to
      your copy of the graph; they are not undoable, because they aren't the
      director's edits. Empty for the overwhelming majority of batches.
      """
      amendments: [GraphEdit!]!
    }

    """
    One edit to a Show's graph (issue #103) — the unit the editor produces
    and the server applies, in place of a whole-graph replacement.

    \`type\` is the command that made it: "graph.addNode", "graph.removeNode",
    "graph.moveNode", "graph.renameNode", "graph.reparentNode",
    "graph.addEdge", "graph.removeEdge", "graph.setFlowDefaultScene",
    "graph.addSceneVariable", "graph.renameSceneVariable", or
    "graph.removeSceneVariable".

    Every other field is optional because GraphQL has no input unions:
    \`type\` decides which of them are read, and an edit missing one its type
    needs is rejected. Undoing an edit is an ordinary edit here, not a
    direction of travel the server knows about (ADR-0005).
    """
    input GraphEditInput {
      type: String!
      "The node an edit acts on: remove, move, rename, reparent."
      nodeId: ID
      "The whole node, for graph.addNode — including a restored one."
      node: GraphNodeInput
      edgeId: ID
      edge: GraphEdgeInput
      "Where a moved or reparented node lands. Flow-local coordinates when it has a parent."
      position: PositionInput
      "The Flow a node is being placed in, or null for Show level."
      parentId: ID
      "The new name, for a rename."
      name: String
      flowId: ID
      "The Flow's entry Scene, or the Scene owning a Variable. Null clears a Flow's default."
      sceneId: ID
      variableId: ID
      variable: SceneVariableInput
    }

    type Query {
      "The signed-in user, or null if the request has no valid session."
      me: User
      "The signed-in user's own Shows, most recently updated first."
      shows: [Show!]!
      "A single Show owned by the signed-in user, or null if it doesn't exist or isn't theirs."
      show(id: ID!): Show
      "The signed-in user's theme settings, or PRD.md §7 defaults if they haven't set any yet."
      userSettings: UserSettings!
      """
      A Show's graph in the given state (default "draft"). A Show that has
      never been edited or published reads as an empty graph — a Show with
      no Flows at all is valid (issue #25).
      """
      showGraph(showId: ID!, state: String): ShowGraph!
    }

    type Mutation {
      "Creates a new Show owned by the signed-in user."
      createShow(name: String!): Show!
      "Renames a Show owned by the signed-in user."
      renameShow(id: ID!, name: String!): Show!
      "Deletes a Show owned by the signed-in user. Returns true on success."
      deleteShow(id: ID!): Boolean!
      "Updates the signed-in user's theme settings. Omitted fields are left unchanged."
      updateUserSettings(themeMode: String, themePalette: String): UserSettings!
      """
      Applies edits to the draft graph of a Show owned by the signed-in user
      (issue #103).

      \`baseVersion\` is the version the edits were composed against. If the
      stored graph has moved on, the whole batch is refused with a CONFLICT
      error rather than applied over the top — half a cascade is a graph
      nobody asked for. The edits are applied in order, and the graph is
      validated once at the end, since a batch legitimately passes through
      states no valid Show could be left in.

      Answers with the new version and any amendments — not the graph, which
      the client already has (issue #111).
      """
      applyShowGraphEdits(
        showId: ID!
        baseVersion: Int!
        edits: [GraphEditInput!]!
      ): AppliedShowGraphEdits!
      "Publishes a Show's draft graph, making it the published graph immediately (ADR-0002)."
      publishShowGraph(showId: ID!): ShowGraph!
    }
  `,
  resolvers: {
    Query: {
      me: (_parent, _args, context) => context.user,
      shows: async (_parent, _args, context) => {
        const userId = requireUserId(context);
        return db.select().from(shows).where(eq(shows.userId, userId)).orderBy(shows.updatedAt);
      },
      show: async (_parent, { id }: { id: string }, context) => {
        const userId = requireUserId(context);
        // Same reasoning as `findOwnShowOrThrow`: a malformed id is just a
        // miss, and this query already returns null for "not yours".
        if (!isId("show", id)) return null;
        const [show] = await db
          .select()
          .from(shows)
          .where(and(eq(shows.id, id), eq(shows.userId, userId)));
        return show ?? null;
      },
      userSettings: async (_parent, _args, context) => {
        const userId = requireUserId(context);
        const [settings] = await db
          .select()
          .from(userSettings)
          .where(eq(userSettings.userId, userId));
        if (!settings) {
          // No row yet — not an error, just "using PRD.md §7 defaults".
          // Deliberately not written here: a read shouldn't have a write
          // side effect, and updateUserSettings creates the row on first
          // actual change (see below).
          const defaults = defaultThemeSettings();
          return { themeMode: defaults.mode, themePalette: defaults.palette };
        }
        return settings;
      },
      showGraph: async (
        _parent,
        { showId, state }: { showId: string; state?: string | null },
        context,
      ) => {
        const userId = requireUserId(context);
        // Ownership first: the graph is part of the Show, so it's readable
        // exactly when the Show is.
        await findOwnShowOrThrow(showId, userId);
        const graphState = validGraphState(state ?? "draft");
        return serializeShowGraph(await readShowGraph(showId, graphState));
      },
    },
    Mutation: {
      createShow: async (_parent, { name }: { name: string }, context) => {
        const userId = requireUserId(context);
        const validName = validShowName(name);
        // Ids are random, so the insert generates one per attempt and
        // retries if the primary key is already taken (../db/ids.ts).
        return withUniqueId("show", async (id) => {
          const [show] = await db.insert(shows).values({ id, name: validName, userId }).returning();
          return show;
        });
      },
      renameShow: async (_parent, { id, name }: { id: string; name: string }, context) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(id, userId);
        const validName = validShowName(name);
        const [updated] = await db
          .update(shows)
          .set({ name: validName, updatedAt: new Date() })
          .where(eq(shows.id, id))
          .returning();
        return updated;
      },
      deleteShow: async (_parent, { id }: { id: string }, context) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(id, userId);
        await db.delete(shows).where(eq(shows.id, id));
        return true;
      },
      updateUserSettings: async (
        _parent,
        { themeMode, themePalette }: { themeMode?: string | null; themePalette?: string | null },
        context,
      ) => {
        const userId = requireUserId(context);
        const defaults = defaultThemeSettings();
        const [existing] = await db
          .select()
          .from(userSettings)
          .where(eq(userSettings.userId, userId));

        const nextThemeMode =
          themeMode != null ? validThemeMode(themeMode) : (existing?.themeMode ?? defaults.mode);
        const nextThemePalette =
          themePalette != null
            ? validThemePalette(themePalette)
            : (existing?.themePalette ?? defaults.palette);

        const [updated] = await db
          .insert(userSettings)
          .values({ userId, themeMode: nextThemeMode, themePalette: nextThemePalette })
          .onConflictDoUpdate({
            target: userSettings.userId,
            set: {
              themeMode: nextThemeMode,
              themePalette: nextThemePalette,
              updatedAt: new Date(),
            },
          })
          .returning();
        return updated;
      },
      applyShowGraphEdits: async (
        _parent,
        {
          showId,
          baseVersion,
          edits,
        }: { showId: string; baseVersion: number; edits: GraphEditInput[] },
        context,
      ) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(showId, userId);
        const applied = await applyEdits(showId, baseVersion, edits.map(parseGraphEdit));
        // The Show's own timestamp tracks "last edited", which the
        // dashboard orders by — a graph edit is an edit to the Show.
        await db.update(shows).set({ updatedAt: new Date() }).where(eq(shows.id, showId));
        return serializeAppliedEdits(applied);
      },
      publishShowGraph: async (_parent, { showId }: { showId: string }, context) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(showId, userId);
        return serializeShowGraph(await publishShowGraph(showId));
      },
    },
  },
});
