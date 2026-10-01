// Typed UserSettings query/mutation documents (issue #15) — mirrors
// show.ts. Converted alongside the operations issue #15 named explicitly
// (me/shows/show/createShow/renameShow/deleteShow) because
// `graphqlRequest` (./client.ts) is now generic over gql.tada's typed
// document node rather than a raw string, so every caller — including
// these — has to pass a typed `graphql()` document to keep compiling.
import { graphql } from "./graphql";
import type { ResultOf } from "gql.tada";

export const GetUserSettingsQuery = graphql(`
  query GetUserSettings {
    userSettings {
      themeMode
      themePalette
      askToEndRunOnClose
    }
  }
`);

export const UpdateUserSettingsMutation = graphql(`
  mutation UpdateUserSettings(
    $themeMode: String
    $themePalette: String
    $askToEndRunOnClose: Boolean
  ) {
    updateUserSettings(
      themeMode: $themeMode
      themePalette: $themePalette
      askToEndRunOnClose: $askToEndRunOnClose
    ) {
      themeMode
      themePalette
      askToEndRunOnClose
    }
  }
`);

export type UserSettings = ResultOf<typeof GetUserSettingsQuery>["userSettings"];
