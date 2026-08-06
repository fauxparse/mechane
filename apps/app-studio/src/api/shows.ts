// TanStack Query hooks over the Show GraphQL operations
// (@presence/graphql-schema). Keeps the "how do we talk to the API" concern
// out of the route components, which only care about the resulting data
// and mutation callbacks.
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
export const showQueryKey = (id: string) => ["shows", id] as const;

export function useShows() {
  return useQuery({
    queryKey: showsQueryKey,
    queryFn: async () => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, ListShowsQuery);
      return data.shows;
    },
  });
}

export function useShow(id: string) {
  return useQuery({
    queryKey: showQueryKey(id),
    queryFn: async () => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, GetShowQuery, { id });
      return data.show;
    },
  });
}

export function useCreateShow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, CreateShowMutation, { name });
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
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, RenameShowMutation, { id, name });
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
      await graphqlRequest(GRAPHQL_ENDPOINT, DeleteShowMutation, { id });
      return id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: showsQueryKey });
    },
  });
}
