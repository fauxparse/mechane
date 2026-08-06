// TanStack Query hooks over the Show GraphQL operations
// (@presence/graphql-schema). Keeps the "how do we talk to the API" concern
// out of the route components, which only care about the resulting data
// and mutation callbacks.
import type { ShowId } from "@presence/domain";
import {
  CreateShowMutation,
  DeleteShowMutation,
  GetShowQuery,
  graphqlRequest,
  ListShowsQuery,
  RenameShowMutation,
} from "@presence/graphql-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { GRAPHQL_ENDPOINT } from "./client";

export const showsQueryKey = ["shows"] as const;
export const showQueryKey = (id: ShowId) => ["shows", id] as const;

// gql.tada types every `ID!` as a plain `string`, so ids arriving from the
// API need re-branding to be usable as `ShowId` (@presence/domain). This
// is an unchecked cast on purpose: the server generated these ids, and
// re-validating our own data on every read would only ever fire if the
// database and the id format had already drifted apart. Ids arriving from
// *outside* — a URL the user typed — go through `assertValidId` instead.
function asShow<T extends { id: string }>(show: T): Omit<T, "id"> & { id: ShowId } {
  return show as unknown as Omit<T, "id"> & { id: ShowId };
}

export function useShows() {
  return useQuery({
    queryKey: showsQueryKey,
    queryFn: async () => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, ListShowsQuery);
      return data.shows.map(asShow);
    },
  });
}

// `id` is nullable so a route can hand over an id it couldn't validate
// (see routes/_authenticated/shows/$showId.tsx) without the caller having
// to fake one: a malformed id in the URL is a miss, and skipping the
// request makes it a miss without a round trip.
export function useShow(id: ShowId | null) {
  return useQuery({
    queryKey: showQueryKey(id ?? ("" as ShowId)),
    enabled: id !== null,
    queryFn: async () => {
      // `enabled` above means this only runs with a non-null id.
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, GetShowQuery, { id: id as ShowId });
      return data.show ? asShow(data.show) : null;
    },
  });
}

export function useCreateShow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, CreateShowMutation, { name });
      return asShow(data.createShow);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: showsQueryKey });
    },
  });
}

export function useRenameShow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: ShowId; name: string }) => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, RenameShowMutation, { id, name });
      return asShow(data.renameShow);
    },
    onSuccess: (show) => {
      void queryClient.invalidateQueries({ queryKey: showsQueryKey });
      queryClient.setQueryData(showQueryKey(show.id), show);
    },
  });
}

export function useDeleteShow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: ShowId) => {
      await graphqlRequest(GRAPHQL_ENDPOINT, DeleteShowMutation, { id });
      return id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: showsQueryKey });
    },
  });
}
