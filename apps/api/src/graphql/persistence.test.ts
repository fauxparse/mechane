import { createYoga } from "graphql-yoga";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "../db/client";
import { shows, user, userSettings } from "../db/schema";
import { schema } from "./schema";
import type { GraphQLContext } from "./context";

const CREATE_SHOW = /* GraphQL */ `
  mutation CreateShow($name: String!) {
    createShow(name: $name) {
      id
      name
    }
  }
`;

const SHOW = /* GraphQL */ `
  query Show($id: ID!) {
    show(id: $id) {
      id
      name
    }
  }
`;

const RENAME_SHOW = /* GraphQL */ `
  mutation RenameShow($id: ID!, $name: String!) {
    renameShow(id: $id, name: $name) {
      id
      name
    }
  }
`;

const SHOWS = /* GraphQL */ `
  query Shows {
    shows {
      id
      name
    }
  }
`;

const DELETE_SHOW = /* GraphQL */ `
  mutation DeleteShow($id: ID!) {
    deleteShow(id: $id)
  }
`;

const USER_SETTINGS = /* GraphQL */ `
  query UserSettings {
    userSettings {
      themeMode
      themePalette
    }
  }
`;

const UPDATE_USER_SETTINGS = /* GraphQL */ `
  mutation UpdateUserSettings($themeMode: String, $themePalette: String) {
    updateUserSettings(themeMode: $themeMode, themePalette: $themePalette) {
      themeMode
      themePalette
    }
  }
`;

type TestUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
};

let testUser: TestUser;

function contextFor(userValue: TestUser | null): GraphQLContext {
  return {
    userId: userValue?.id ?? null,
    user: userValue,
  };
}

function testYoga(contextValue: GraphQLContext) {
  return createYoga<GraphQLContext>({
    schema,
    context: () => contextValue,
    graphqlEndpoint: "/api/graphql",
  });
}

async function rawRequest<T>(
  source: string,
  contextValue: GraphQLContext,
  variableValues?: Record<string, unknown>,
): Promise<{ data?: T; errors?: Array<{ message: string; extensions?: Record<string, unknown> }> }> {
  const response = await testYoga(contextValue).fetch("http://localhost/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: source, variables: variableValues }),
  });
  expect(response.ok).toBe(true);
  return response.json();
}

async function request<T>(
  source: string,
  contextValue: GraphQLContext,
  variableValues?: Record<string, unknown>,
): Promise<T> {
  const result = await rawRequest<T>(source, contextValue, variableValues);
  expect(result.errors).toBeUndefined();
  if (!result.data) throw new Error("GraphQL response did not contain data.");
  return result.data;
}
beforeEach(async () => {
  testUser = {
    id: `api-test-${crypto.randomUUID()}`,
    name: "Persistence Test User",
    email: `api-test-${crypto.randomUUID()}@example.com`,
    emailVerified: true,
  };
  await db.insert(user).values(testUser);
});

afterEach(async () => {
  await db.delete(user).where(eq(user.id, testUser.id));
});

describe("GraphQL persistence", () => {
  it("persists the Show lifecycle across API requests", async () => {
    const context = contextFor(testUser);
    const created = await request<{ createShow: { id: string; name: string } }>(
      CREATE_SHOW,
      context,
      { name: "  Rehearsal  " },
    );

    expect(created.createShow.name).toBe("Rehearsal");

    const reread = await request<{ show: { id: string; name: string } | null }>(SHOW, context, {
      id: created.createShow.id,
    });
    expect(reread.show).toEqual(created.createShow);

    const renamed = await request<{ renameShow: { id: string; name: string } }>(RENAME_SHOW, context, {
      id: created.createShow.id,
      name: "Opening Night",
    });
    expect(renamed.renameShow).toEqual({ id: created.createShow.id, name: "Opening Night" });

    const listed = await request<{ shows: Array<{ id: string; name: string }> }>(SHOWS, context);
    expect(listed.shows).toContainEqual(renamed.renameShow);

    await request<{ deleteShow: boolean }>(DELETE_SHOW, context, { id: created.createShow.id });
    const afterDelete = await request<{ show: { id: string; name: string } | null }>(SHOW, context, {
      id: created.createShow.id,
    });
    expect(afterDelete.show).toBeNull();

    const persistedRows = await db.select().from(shows).where(eq(shows.id, created.createShow.id));
    expect(persistedRows).toHaveLength(0);
  });

  it("persists settings for the signed-in user", async () => {
    const context = contextFor(testUser);
    const defaults = await request<{ userSettings: { themeMode: string; themePalette: string } }>(
      USER_SETTINGS,
      context,
    );
    expect(defaults.userSettings).toEqual({ themeMode: "dark", themePalette: "gruvbox" });

    const updated = await request<{ updateUserSettings: { themeMode: string; themePalette: string } }>(
      UPDATE_USER_SETTINGS,
      context,
      { themeMode: "dark", themePalette: "catppuccin" },
    );
    expect(updated.updateUserSettings).toEqual({ themeMode: "dark", themePalette: "catppuccin" });
    const persistedRows = await db
      .select()
      .from(userSettings)
      .where(and(eq(userSettings.userId, testUser.id), eq(userSettings.themeMode, "dark")));
    expect(persistedRows).toHaveLength(1);

  });
});
