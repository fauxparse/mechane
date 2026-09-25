import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { authClient } from "./auth-client";
import { meQueryKey } from "./me";

export class AuthRequestError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "AuthRequestError";
    this.code = code;
  }
}

function toAuthRequestError(error: unknown, fallback: string): AuthRequestError {
  if (error !== null && typeof error === "object") {
    const message =
      "message" in error && typeof error.message === "string" ? error.message : fallback;
    const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
    return new AuthRequestError(message, code);
  }
  return new AuthRequestError(fallback);
}

export function isEmailNotVerifiedError(error: unknown): boolean {
  return error instanceof AuthRequestError && error.code === "EMAIL_NOT_VERIFIED";
}

export function useSignIn() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data, error } = await authClient.signIn.email({
        email,
        password,
        callbackURL: window.location.origin,
      });
      if (error) throw toAuthRequestError(error, "Sign in failed.");
      return data;
    },
    onSuccess: async () => {
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
      const { data, error } = await authClient.signUp.email({
        name,
        email,
        password,
        callbackURL: window.location.origin,
      });
      if (error) throw toAuthRequestError(error, "Sign up failed.");
      return data;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      if (data?.token) void navigate({ to: "/" });
    },
  });
}

export function useResendVerification() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data, error } = await authClient.signIn.email({
        email,
        password,
        callbackURL: window.location.origin,
      });
      if (error) throw toAuthRequestError(error, "Could not resend the verification email.");
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      void navigate({ to: "/" });
    },
  });
}

export function useRequestPasswordReset() {
  // These mutations only affect the emailed link and password credential.
  // react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation
  return useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const { data, error } = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw toAuthRequestError(error, "Could not send the password reset email.");
      return data;
    },
  });
}

export function useResetPassword() {
  // The reset route owns its completion state; no cached query changes.
  // react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation
  return useMutation({
    mutationFn: async ({ newPassword, token }: { newPassword: string; token: string }) => {
      const { data, error } = await authClient.resetPassword({ newPassword, token });
      if (error) throw toAuthRequestError(error, "Could not reset the password.");
      return data;
    },
  });
}

export function useSignInWithGoogle() {
  // No cache to invalidate: this hands the browser off to Google and comes
  // back through `callbackURL` as a fresh page load, so every query is
  // re-fetched anyway.
  // react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.origin,
      });
      if (error) throw toAuthRequestError(error, "Google sign-in failed.");
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
      if (error) throw toAuthRequestError(error, "Sign out failed.");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      void navigate({ to: "/sign-in" });
    },
  });
}
