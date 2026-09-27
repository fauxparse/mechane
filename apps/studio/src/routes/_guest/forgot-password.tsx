import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { useRequestPasswordReset } from "../../api/auth";
import { ForgotPasswordScreen } from "../../components/PasswordResetScreens";

export const Route = createFileRoute("/_guest/forgot-password")({
  component: ForgotPasswordRoute,
});

function ForgotPasswordRoute() {
  const [submitted, setSubmitted] = useState(false);
  const requestReset = useRequestPasswordReset();

  if (submitted) return <ForgotPasswordScreen state="sent" />;

  return (
    <ForgotPasswordScreen
      state="form"
      pending={requestReset.isPending}
      error={requestReset.isError ? requestReset.error.message : null}
      onSubmit={(email) => {
        requestReset.mutate({ email }, { onSuccess: () => setSubmitted(true) });
      }}
    />
  );
}
