import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  LockIcon,
} from "@mechane/design-system";
import { useResetPassword } from "../../api/auth";
import { GuestAuthLayout } from "../../components/GuestAuthLayout";

export const Route = createFileRoute("/_guest/reset-password")({
  validateSearch: z.object({
    token: z.string().optional(),
    error: z.string().optional(),
  }),
  component: ResetPasswordRoute,
});

function ResetPasswordRoute() {
  const { token, error: tokenError } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const resetPassword = useResetPassword();

  if (completed) {
    return (
      <GuestAuthLayout>
        <Card size="lg" className="w-full max-w-sm">
          <CardContent className="flex flex-col gap-5">
            <CardHeader className="px-0">
              <CardTitle>Password updated</CardTitle>
              <CardDescription>
                Your password has been changed. You can sign in now.
              </CardDescription>
            </CardHeader>
            <Link
              to="/sign-in"
              className="text-center text-sm text-muted-foreground hover:underline"
            >
              Back to sign in
            </Link>
          </CardContent>
        </Card>
      </GuestAuthLayout>
    );
  }

  if (!token || tokenError) {
    return (
      <GuestAuthLayout>
        <Card size="lg" className="w-full max-w-sm">
          <CardContent className="flex flex-col gap-5">
            <CardHeader className="px-0">
              <CardTitle>That reset link is invalid</CardTitle>
              <CardDescription>Request a new password reset link and try again.</CardDescription>
            </CardHeader>
            <Link
              to="/forgot-password"
              className="text-center text-sm text-muted-foreground hover:underline"
            >
              Request another link
            </Link>
          </CardContent>
        </Card>
      </GuestAuthLayout>
    );
  }

  return (
    <GuestAuthLayout>
      <Card size="lg" className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-5">
          <CardHeader className="px-0">
            <CardTitle>Choose a new password</CardTitle>
            <CardDescription>Use at least eight characters.</CardDescription>
          </CardHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (password !== confirmation) {
                setValidationError("The passwords do not match.");
                return;
              }
              setValidationError(null);
              resetPassword.mutate(
                { newPassword: password, token },
                { onSuccess: () => setCompleted(true) },
              );
            }}
          >
            <InputGroup size="lg">
              <InputGroupAddon className="w-8">
                <LockIcon className="size-5 text-muted-foreground" />
              </InputGroupAddon>
              <InputGroupInput
                type="password"
                autoComplete="new-password"
                placeholder="New password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={resetPassword.isPending}
                required
              />
            </InputGroup>
            <InputGroup size="lg">
              <InputGroupAddon className="w-8">
                <LockIcon className="size-5 text-muted-foreground" />
              </InputGroupAddon>
              <InputGroupInput
                type="password"
                autoComplete="new-password"
                placeholder="Confirm password"
                minLength={8}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={resetPassword.isPending}
                required
              />
            </InputGroup>
            {validationError || resetPassword.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {validationError ?? resetPassword.error?.message}
              </p>
            ) : null}
            <Button type="submit" size="lg" disabled={resetPassword.isPending}>
              {resetPassword.isPending ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <Link to="/sign-in" className="text-sm text-muted-foreground hover:underline">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </GuestAuthLayout>
  );
}
