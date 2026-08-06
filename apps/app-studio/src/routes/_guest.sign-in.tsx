// The sign-in/sign-up screen ("/sign-in", issue #13) — one route toggling
// between the two modes (AuthForm), rather than two near-identical routes,
// since Better Auth's endpoints and the surrounding layout are identical.
// A polished entry point per PRD.md §7/issue #13: a two-panel layout
// (brand statement + form Card) instead of a bare centered form.
// Signed-in visitors never reach this component — the parent `_guest`
// layout's `beforeLoad` (_guest.tsx, issue #30) redirects them to the
// dashboard before it renders.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { useSignIn, useSignInWithGoogle, useSignUp } from "../api/auth";
import { AuthForm } from "../components/AuthForm";
import type { AuthMode } from "../components/AuthForm";

const GOOGLE_OAUTH_ENABLED = import.meta.env.VITE_GOOGLE_OAUTH_ENABLED === "true";

export const Route = createFileRoute("/_guest/sign-in")({
  component: SignInRoute,
});

function SignInRoute() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const signIn = useSignIn();
  const signUp = useSignUp();
  const signInWithGoogle = useSignInWithGoogle();

  const activeMutation = mode === "sign-in" ? signIn : signUp;

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-muted p-12 lg:flex">
        <Link to="/sign-in" className="text-lg font-semibold tracking-tight">
          Presence
        </Link>
        <div className="max-w-md">
          <p className="text-4xl leading-tight font-semibold text-balance">
            Interactive tech for live theatre, built for the room it's in.
          </p>
          <p className="mt-4 text-muted-foreground">
            Design Scenes, wire up Devices, and run the show — from the director's laptop to every
            phone in the audience.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} Presence</p>
      </section>

      <section className="flex flex-col items-center justify-center gap-8 p-6 py-16">
        <Link to="/sign-in" className="text-lg font-semibold tracking-tight lg:hidden">
          Presence
        </Link>

        <AuthForm
          className="w-full max-w-sm"
          mode={mode}
          onToggleMode={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            signIn.reset();
            signUp.reset();
          }}
          onSubmit={(values) => {
            if (mode === "sign-in") {
              signIn.mutate({ email: values.email, password: values.password });
            } else {
              signUp.mutate(values);
            }
          }}
          pending={activeMutation.isPending}
          error={activeMutation.error?.message}
          googleEnabled={GOOGLE_OAUTH_ENABLED}
          onGoogleSignIn={() => signInWithGoogle.mutate()}
          googlePending={signInWithGoogle.isPending}
        />
      </section>
    </main>
  );
}
