// TanStack Query hooks for the admin area (issue #826). Accounts go through
// Better Auth's admin endpoints (./auth-client.ts), which check the caller's
// role themselves; users' Shows go through the admin GraphQL slice
// (apps/api/src/graphql/admin.ts). Either way the API decides what is
// allowed — these hooks only carry the request and keep the caches honest.
import { DEFAULT_ROLE, type Role } from "@mechane/domain/access-control";
import { AdminDeleteShowMutation, graphqlRequest, UserShowsQuery } from "@mechane/graphql-schema";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AdminUser } from "../components/Admin/admin-user";
import { toAuthRequestError } from "./auth";
import { authClient } from "./auth-client";
import { GRAPHQL_ENDPOINT } from "./client";
import { showsQueryKey } from "./shows";

export const ADMIN_USERS_PAGE_SIZE = 50;

const adminUsersKey = ["admin", "users"] as const;
const adminUserShowsKey = (userId: string) => [...adminUsersKey, userId, "shows"] as const;

interface BetterAuthUser {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned: boolean | null;
  createdAt: Date | string;
}

function toAdminUser(user: BetterAuthUser): AdminUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role ?? DEFAULT_ROLE,
    banned: user.banned ?? false,
    createdAt: new Date(user.createdAt).toISOString(),
  };
}

/** One page of accounts, newest first, optionally narrowed to emails containing `search`. */
export function useAdminUsers({ search, page }: { search: string; page: number }) {
  const searchValue = search.trim();
  return useQuery({
    queryKey: [...adminUsersKey, "list", { search: searchValue, page }],
    queryFn: async () => {
      const { data, error } = await authClient.admin.listUsers({
        query: {
          ...(searchValue ? { searchValue, searchField: "email", searchOperator: "contains" } : {}),
          sortBy: "createdAt",
          sortDirection: "desc",
          limit: ADMIN_USERS_PAGE_SIZE,
          offset: page * ADMIN_USERS_PAGE_SIZE,
        },
      });
      if (error) throw toAuthRequestError(error, "Couldn't load users.");
      return { users: data.users.map(toAdminUser), total: data.total };
    },
    // Paging and typing in the search box should not blank the table.
    placeholderData: keepPreviousData,
  });
}

export function useAdminUser(userId: string) {
  return useQuery({
    queryKey: [...adminUsersKey, userId],
    queryFn: async () => {
      const { data, error } = await authClient.admin.getUser({ query: { id: userId } });
      if (error) throw toAuthRequestError(error, "Couldn't load this user.");
      return toAdminUser(data);
    },
  });
}

export function useUserShows(userId: string) {
  return useQuery({
    queryKey: adminUserShowsKey(userId),
    queryFn: async () => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, UserShowsQuery, { userId });
      return data.userShows;
    },
  });
}

function useInvalidateAdminUsers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: adminUsersKey });
}

export function useSetUserRole() {
  const invalidate = useInvalidateAdminUsers();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      const { error } = await authClient.admin.setRole({ userId, role });
      if (error) throw toAuthRequestError(error, "Couldn't change the role.");
    },
    onSuccess: invalidate,
  });
}

/** Bans take effect at once: the API ends every session the user has. */
export function useBanUser() {
  const invalidate = useInvalidateAdminUsers();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await authClient.admin.banUser({ userId });
      if (error) throw toAuthRequestError(error, "Couldn't ban this user.");
    },
    onSuccess: invalidate,
  });
}

export function useUnbanUser() {
  const invalidate = useInvalidateAdminUsers();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await authClient.admin.unbanUser({ userId });
      if (error) throw toAuthRequestError(error, "Couldn't unban this user.");
    },
    onSuccess: invalidate,
  });
}

/** Removing a user deletes their Shows with them (the database cascades). */
export function useRemoveUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await authClient.admin.removeUser({ userId });
      if (error) throw toAuthRequestError(error, "Couldn't delete this user.");
    },
    onSuccess: (_data, userId) => {
      queryClient.removeQueries({ queryKey: [...adminUsersKey, userId] });
      void queryClient.invalidateQueries({ queryKey: [...adminUsersKey, "list"] });
    },
  });
}

export function useAdminDeleteShow(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (showId: string) => {
      await graphqlRequest(GRAPHQL_ENDPOINT, AdminDeleteShowMutation, { id: showId });
      return showId;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminUserShowsKey(userId) });
      // The admin may have deleted one of their own Shows.
      void queryClient.invalidateQueries({ queryKey: showsQueryKey });
    },
  });
}
