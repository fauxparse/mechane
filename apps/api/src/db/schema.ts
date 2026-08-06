// Drizzle schema for Better Auth's own tables (user/session/account/verification).
//
// Field/table shapes follow Better Auth's core schema exactly — see
// https://www.better-auth.com/docs/concepts/database#core-schema — so that
// the drizzle adapter can be pointed at this schema with no field mapping.
//
// Application resources (Show, etc.) are added by later tickets. Every such
// table is expected to carry a `userId` column referencing `user.id`, per the
// single-user ownership model (PRD.md §1, §9) — see @presence/domain's
// `ownership` module for the shared invariant this schema exists to support.
import { generateId } from "@presence/domain";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
// user — see @presence/domain's `ownership` module, which resolvers use to
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
// @presence/domain's `assertValidThemeMode`/`assertValidThemePalette`
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
