// TanStack Query hooks over the UserSettings GraphQL operations
// (@presence/graphql-schema) — mirrors api/shows.ts. Backs the theme
// switcher (@presence/design-system's ThemeProvider): the design system
// itself has no idea how settings are fetched/persisted, it just calls the
// callbacks this hook supplies.
import {
  GET_USER_SETTINGS_QUERY,
  graphqlRequest,
  UPDATE_USER_SETTINGS_MUTATION,
  type UserSettings,
} from "@presence/graphql-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { GRAPHQL_ENDPOINT } from "./client";

export const userSettingsQueryKey = ["userSettings"] as const;

export function useUserSettings(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: userSettingsQueryKey,
    enabled: options.enabled,
    queryFn: async () => {
      const data = await graphqlRequest<{ userSettings: UserSettings }>(
        GRAPHQL_ENDPOINT,
        GET_USER_SETTINGS_QUERY,
      );
      return data.userSettings;
    },
  });
}

export function useUpdateUserSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { themeMode?: string; themePalette?: string }) => {
      const data = await graphqlRequest<
        { updateUserSettings: UserSettings },
        { themeMode?: string; themePalette?: string }
      >(GRAPHQL_ENDPOINT, UPDATE_USER_SETTINGS_MUTATION, patch);
      return data.updateUserSettings;
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(userSettingsQueryKey, settings);
    },
  });
}
