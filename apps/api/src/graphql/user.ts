// The signed-in user's slice: who they are (the Better Auth session user,
// resolved in ./context.ts), who is impersonating them if anyone (issue #845),
// and their design-system preference (PRD.md §7).
// Theme values are validated here — the GraphQL error translation of
// @mechane/domain's theme assertions — because "which theme modes exist" is
// policy this slice's mutations own.
import {
  assertValidThemeMode,
  assertValidThemePalette,
  defaultThemeSettings,
  InvalidThemeModeError,
  InvalidThemePaletteError,
} from "@mechane/domain/theme-settings";
import { eq } from "drizzle-orm";
import { GraphQLError } from "graphql";

import { db } from "../db/client";
import { user, userSettings } from "../db/schema";
import type { Resolvers } from "./context";
import { requireUserId } from "./context";

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

export const typeDefs = /* GraphQL */ `
  type User {
    id: ID!
    name: String!
    email: String!
    emailVerified: Boolean!
    "The user's system role (@mechane/domain/access-control), e.g. user or admin."
    role: String!
  }

  "The signed-in user's design-system preference (PRD.md §7)."
  type UserSettings {
    "Display mode: light or dark."
    themeMode: String!
    "Which built-in theme is active."
    themePalette: String!
  }

  type Query {
    "The signed-in user, or null if the request has no valid session."
    me: User
    """
    The admin impersonating the signed-in user in this session, or null when the
    session is the user's own. While impersonating, \`me\` is the impersonated user.
    """
    impersonator: User
    "The signed-in user's theme settings, or PRD.md §7 defaults if they haven't set any yet."
    userSettings: UserSettings!
  }

  type Mutation {
    updateUserSettings(themeMode: String, themePalette: String): UserSettings!
  }
`;

export const resolvers: Resolvers = {
  Query: {
    me: (_parent, _args, context) => context.user,
    impersonator: async (_parent, _args, context) => {
      if (!context.impersonatorId) return null;
      const [impersonator] = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          role: user.role,
        })
        .from(user)
        .where(eq(user.id, context.impersonatorId));
      return impersonator ?? null;
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
  },
  Mutation: {
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
  },
};
