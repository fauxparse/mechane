// Client-side mirror of the UserSettings type in
// apps/api/src/graphql/schema.ts. Hand-written until a codegen tool is
// chosen (see client.ts) — keep this in sync with the server typeDefs when
// the UserSettings type changes.
export interface UserSettings {
  themeMode: string;
  themePalette: string;
}

export const USER_SETTINGS_FIELDS = /* GraphQL */ `
  themeMode
  themePalette
`;

export const GET_USER_SETTINGS_QUERY = /* GraphQL */ `
  query GetUserSettings {
    userSettings {
      ${USER_SETTINGS_FIELDS}
    }
  }
`;

export const UPDATE_USER_SETTINGS_MUTATION = /* GraphQL */ `
  mutation UpdateUserSettings($themeMode: String, $themePalette: String) {
    updateUserSettings(themeMode: $themeMode, themePalette: $themePalette) {
      ${USER_SETTINGS_FIELDS}
    }
  }
`;
