// The sign-in/sign-up screen ("/sign-in", issue #13) — one route toggling
// between the two modes (AuthForm), rather than two near-identical routes,
// since Better Auth's endpoints and the surrounding layout are identical.
// A polished entry point per PRD.md §7/issue #13: a two-panel layout
// (brand statement + form Card) instead of a bare centered form.
// Signed-in visitors never reach this component — the parent `_guest`
// layout's `beforeLoad` (_guest/route.tsx, issue #30) redirects them to the
// dashboard before it renders.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@mechane/design-system";
import {
  isEmailNotVerifiedError,
  useResendVerification,
  useSignIn,
  useSignInWithGoogle,
  useSignUp,
} from "../../api/auth";
import { GuestAuthLayout } from "../../components/GuestAuthLayout";
import type { AuthFormValues, AuthMode } from "../../components/AuthForm";
import { AuthForm } from "../../components/AuthForm";

const GOOGLE_OAUTH_ENABLED = import.meta.env.VITE_GOOGLE_OAUTH_ENABLED === "true";

export const Route = createFileRoute("/_guest/sign-in")({
  component: SignInRoute,
});

function SignInRoute() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [credentials, setCredentials] = useState<AuthFormValues | null>(null);
  const signIn = useSignIn();
  const signUp = useSignUp();
  const resendVerification = useResendVerification();
  const signInWithGoogle = useSignInWithGoogle();
  const signUpNeedsVerification = signUp.isSuccess && signUp.data?.token === null;
  const verificationError = isEmailNotVerifiedError(signIn.error);

  const resetAuthState = () => {
    setCredentials(null);
    signIn.reset();
    signUp.reset();
    resendVerification.reset();
  };

  const resend = () => {
    if (!credentials) return;
    resendVerification.mutate({ email: credentials.email, password: credentials.password });
  };

  if (signUpNeedsVerification && credentials) {
    return (
      <GuestAuthLayout>
        <Card size="lg" className="w-full max-w-sm">
          <CardContent className="flex flex-col gap-5">
            <CardHeader className="px-0">
              <CardTitle>Check your inbox</CardTitle>
              <CardDescription>
                We sent a verification link to <strong>{credentials.email}</strong>. Open it to
                finish creating your account.
              </CardDescription>
            </CardHeader>
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={resend}
                disabled={resendVerification.isPending}
              >
                {resendVerification.isPending ? "Sending…" : "Resend verification email"}
              </Button>
              {resendVerification.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  {isEmailNotVerifiedError(resendVerification.error)
                    ? "A new link was sent. Check your inbox."
                    : resendVerification.error.message}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="link"
              onClick={() => {
                resetAuthState();
                setMode("sign-in");
              }}
            >
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </GuestAuthLayout>
    );
  }

  const activeMutation = mode === "sign-in" ? signIn : signUp;
  const error = verificationError
    ? "This email is not verified. We sent a new verification link."
    : activeMutation.error?.message;

  return (
    <GuestAuthLayout>
      <div className="flex w-full max-w-sm flex-col items-center gap-3">
        <AuthForm
          className="w-full"
          mode={mode}
          onToggleMode={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            resetAuthState();
          }}
          onSubmit={(values) => {
            setCredentials(values);
            resendVerification.reset();
            if (mode === "sign-in") {
              signIn.mutate({ email: values.email, password: values.password });
            } else {
              signUp.mutate(values);
            }
          }}
          pending={activeMutation.isPending}
          error={error}
          googleEnabled={GOOGLE_OAUTH_ENABLED}
          onGoogleSignIn={() => signInWithGoogle.mutate()}
          googlePending={signInWithGoogle.isPending}
        />
        {mode === "sign-in" && verificationError && credentials ? (
          <div className="flex flex-col items-center gap-2">
            <Button
              type="button"
              variant="link"
              onClick={resend}
              disabled={resendVerification.isPending}
            >
              {resendVerification.isPending ? "Sending…" : "Resend verification email"}
            </Button>
            {resendVerification.isError ? (
              <p role="alert" className="text-center text-sm text-muted-foreground">
                {isEmailNotVerifiedError(resendVerification.error)
                  ? "A new link was sent. Check your inbox."
                  : resendVerification.error.message}
              </p>
            ) : null}
          </div>
        ) : null}
        {mode === "sign-in" ? (
          <Link to="/forgot-password" className="text-sm text-muted-foreground hover:underline">
            Forgot your password?
          </Link>
        ) : null}
      </div>
    </GuestAuthLayout>
  );
}
