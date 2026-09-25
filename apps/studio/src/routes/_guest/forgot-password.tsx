import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

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
  MailIcon,
} from "@mechane/design-system";
import { useRequestPasswordReset } from "../../api/auth";
import { GuestAuthLayout } from "../../components/GuestAuthLayout";

export const Route = createFileRoute("/_guest/forgot-password")({
  component: ForgotPasswordRoute,
});

function ForgotPasswordRoute() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const requestReset = useRequestPasswordReset();

  if (submitted) {
    return (
      <GuestAuthLayout>
        <Card size="lg" className="w-full max-w-sm">
          <CardContent className="flex flex-col gap-5">
            <CardHeader className="px-0">
              <CardTitle>Check your inbox</CardTitle>
              <CardDescription>
                If an account uses that email address, we sent a password reset link.
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

  return (
    <GuestAuthLayout>
      <Card size="lg" className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-5">
          <CardHeader className="px-0">
            <CardTitle>Reset your password</CardTitle>
            <CardDescription>Enter your email and we'll send you a reset link.</CardDescription>
          </CardHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              requestReset.mutate({ email }, { onSuccess: () => setSubmitted(true) });
            }}
          >
            <InputGroup size="lg">
              <InputGroupAddon className="w-8">
                <MailIcon className="size-5 text-muted-foreground" />
              </InputGroupAddon>
              <InputGroupInput
                type="email"
                autoComplete="email"
                placeholder="Email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={requestReset.isPending}
                required
              />
            </InputGroup>
            {requestReset.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {requestReset.error.message}
              </p>
            ) : null}
            <Button type="submit" size="lg" disabled={requestReset.isPending}>
              {requestReset.isPending ? "Sending…" : "Send reset link"}
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
