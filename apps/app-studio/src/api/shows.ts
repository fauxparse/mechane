// TanStack Query hooks over the Show GraphQL operations
// (@presence/graphql-schema). Keeps the "how do we talk to the API" concern
// out of the route components, which only care about the resulting data
// and mutation callbacks.
import {
  CREATE_SHOW_MUTATION,
  DELETE_SHOW_MUTATION,
  GET_SHOW_QUERY,
  graphqlRequest,
  LIST_SHOWS_QUERY,
  RENAME_SHOW_MUTATION,
  type Show,
} from "@presence/graphql-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { GRAPHQL_ENDPOINT } from "./client";

export const showsQueryKey = ["shows"] as const;
export const showQueryKey = (id: string) => ["shows", id] as const;

export function useShows() {
  return useQuery({
    queryKey: showsQueryKey,
    queryFn: async () => {
      const data = await graphqlRequest<{ shows: Show[] }>(GRAPHQL_ENDPOINT, LIST_SHOWS_QUERY);
      return data.shows;
    },
  });
}

export function useShow(id: string) {
  return useQuery({
    queryKey: showQueryKey(id),
    queryFn: async () => {
      const data = await graphqlRequest<{ show: Show | null }, { id: string }>(
        GRAPHQL_ENDPOINT,
        GET_SHOW_QUERY,
        { id },
      );
      return data.show;
    },
  });
}

export function useCreateShow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const data = await graphqlRequest<{ createShow: Show }, { name: string }>(
        GRAPHQL_ENDPOINT,
        CREATE_SHOW_MUTATION,
        { name },
      );
      return data.createShow;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: showsQueryKey });
    },
  });
}

export function useRenameShow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const data = await graphqlRequest<{ renameShow: Show }, { id: string; name: string }>(
        GRAPHQL_ENDPOINT,
        RENAME_SHOW_MUTATION,
        { id, name },
      );
      return data.renameShow;
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
    mutationFn: async (id: string) => {
      await graphqlRequest<{ deleteShow: boolean }, { id: string }>(
        GRAPHQL_ENDPOINT,
        DELETE_SHOW_MUTATION,
        { id },
      );
      return id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: showsQueryKey });
    },
  });
}
