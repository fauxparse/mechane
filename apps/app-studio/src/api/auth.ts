// TanStack Query mutations over Better Auth's client (authClient, see
// ./auth-client.ts) — mirrors the pattern in ./shows.ts: routes only see
// data + mutation callbacks, never the transport. Better Auth's client
// methods resolve to `{ data, error }` rather than throwing, so each
// mutationFn throws the error itself to fit the rest of the app's
// "mutation.error" handling (e.g. ShowNameForm's `error` prop).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { authClient } from "./auth-client";
import { meQueryKey } from "./me";

export function useSignIn() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data, error } = await authClient.signIn.email({ email, password });
      if (error) throw new Error(error.message ?? "Sign in failed.");
      return data;
    },
    onSuccess: async () => {
      // Invalidating alone doesn't refetch `me` — nothing subscribes to it
      // once mounted (the auth guard lives in the router's `beforeLoad`,
      // issue #30), so the redirect has to come from an explicit
      // navigation, which re-runs `beforeLoad` against the now-invalidated
      // query.
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      void navigate({ to: "/" });
    },
  });
}

export function useSignUp() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async ({
      name,
      email,
      password,
    }: {
      name: string;
      email: string;
      password: string;
    }) => {
      const { data, error } = await authClient.signUp.email({ name, email, password });
      if (error) throw new Error(error.message ?? "Sign up failed.");
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      void navigate({ to: "/" });
    },
  });
}

export function useSignInWithGoogle() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.origin,
      });
      if (error) throw new Error(error.message ?? "Google sign-in failed.");
      return data;
    },
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? "Sign out failed.");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      void navigate({ to: "/sign-in" });
    },
  });
}
