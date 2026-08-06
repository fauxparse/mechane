// GraphQL schema. `me` proves a signed-in user is resolvable in the
// resolver layer; the Show query/mutations (issue #3) are the first real
// owned-resource vertical slice, using `requireUserId` (./context.ts) and
// `assertOwnedBy`/`assertValidShowName` (@mechane/domain) the same way
// every later owned resource (Scene, Device, ...) should.
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
import { publishShowGraph, readShowGraph, writeShowGraph } from "../db/show-graph";
import { requireUserId } from "./context";
import type { GraphQLContext } from "./context";
import { parseShowGraphInput, serializeShowGraph } from "./show-graph";
import type { ShowGraphInput } from "./show-graph";

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

async function saveGraph(showId: string, state: GraphState, input: ShowGraphInput) {
  try {
    return await writeShowGraph(showId, state, parseShowGraphInput(input));
  } catch (error) {
    if (error instanceof InvalidShowGraphError) {
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
    }

    """
    An edge in the Show graph, always running producer → consumer. \`kind\` is
    "wiring" (Source/Transformer → Scene Variable), "navigate" (Scene → Scene
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

    input ShowGraphInput {
      nodes: [GraphNodeInput!]!
      edges: [GraphEdgeInput!]!
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
      "Replaces the draft graph of a Show owned by the signed-in user, wholesale."
      saveShowGraph(showId: ID!, graph: ShowGraphInput!): ShowGraph!
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
      saveShowGraph: async (
        _parent,
        { showId, graph }: { showId: string; graph: ShowGraphInput },
        context,
      ) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(showId, userId);
        const saved = await saveGraph(showId, "draft", graph);
        // The Show's own timestamp tracks "last edited", which the
        // dashboard orders by — a graph edit is an edit to the Show.
        await db.update(shows).set({ updatedAt: new Date() }).where(eq(shows.id, showId));
        return serializeShowGraph(saved);
      },
      publishShowGraph: async (_parent, { showId }: { showId: string }, context) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(showId, userId);
        return serializeShowGraph(await publishShowGraph(showId));
      },
    },
  },
});
