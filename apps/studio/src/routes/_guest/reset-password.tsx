import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { useResetPassword } from "../../api/auth";
import { ResetPasswordScreen } from "../../components/PasswordResetScreens";

export const Route = createFileRoute("/_guest/reset-password")({
  validateSearch: z.object({
    token: z.string().optional(),
    error: z.string().optional(),
  }),
  component: ResetPasswordRoute,
});

function ResetPasswordRoute() {
  const { token, error: tokenError } = Route.useSearch();
  const [completed, setCompleted] = useState(false);
  const resetPassword = useResetPassword();

  if (completed) return <ResetPasswordScreen state="completed" />;
  if (!token || tokenError) return <ResetPasswordScreen state="invalid" />;

  return (
    <ResetPasswordScreen
      state="form"
      pending={resetPassword.isPending}
      error={resetPassword.isError ? resetPassword.error.message : null}
      onSubmit={(newPassword) => {
        resetPassword.mutate({ newPassword, token }, { onSuccess: () => setCompleted(true) });
      }}
    />
  );
}
