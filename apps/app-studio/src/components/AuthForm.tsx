// The sign-in/sign-up form (issue #13) — one component for both modes since
// they're the same shape (email/password, an optional name field, a
// Google button) with different copy and a mode toggle, rather than two
// near-duplicate screens. Presentational, like ShowNameForm: the route
// (SignInRoute) wires onSubmit/onGoogleSignIn to Better Auth's client and
// supplies pending/error state. Built entirely from
// @presence/design-system primitives — no raw <input>/<button>.
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@presence/design-system";
import { useId, useState } from "react";
import type { FormEvent } from "react";

export type AuthMode = "sign-in" | "sign-up";

export interface AuthFormValues {
  name: string;
  email: string;
  password: string;
}

export interface AuthFormProps {
  mode: AuthMode;
  onSubmit: (values: AuthFormValues) => void;
  onToggleMode: () => void;
  pending?: boolean;
  error?: string;
  googleEnabled?: boolean;
  onGoogleSignIn?: () => void;
  googlePending?: boolean;
  className?: string;
}

const COPY: Record<AuthMode, { title: string; description: string; submitLabel: string }> = {
  "sign-in": {
    title: "Welcome back",
    description: "Sign in to pick up your Shows where you left off.",
    submitLabel: "Sign in",
  },
  "sign-up": {
    title: "Create your account",
    description: "Start building interactive tech for your next Show.",
    submitLabel: "Create account",
  },
};

export function AuthForm({
  mode,
  onSubmit,
  onToggleMode,
  pending,
  error,
  googleEnabled,
  onGoogleSignIn,
  googlePending,
  className,
}: AuthFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const formId = useId();
  const copy = COPY[mode];

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({ name, email, password });
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-xl">{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {googleEnabled ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onGoogleSignIn}
              disabled={googlePending}
            >
              <GoogleIcon />
              {googlePending ? "Connecting…" : "Continue with Google"}
            </Button>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {mode === "sign-up" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${formId}-name`}>Name</Label>
              <Input
                id={`${formId}-name`}
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={pending}
                required
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-email`}>Email</Label>
            <Input
              id={`${formId}-email`}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
              aria-invalid={error ? true : undefined}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-password`}>Password</Label>
            <Input
              id={`${formId}-password`}
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={pending}
              aria-invalid={error ? true : undefined}
              required
              minLength={8}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "One moment…" : copy.submitLabel}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center">
        <Button type="button" variant="link" onClick={onToggleMode}>
          {mode === "sign-in"
            ? "Don't have an account? Sign up"
            : "Already have an account? Sign in"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47a5.53 5.53 0 0 1-2.4 3.63v3.02h3.87c2.27-2.09 3.58-5.17 3.58-8.83z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.94-2.9l-3.87-3.02c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.12-6.73-4.96H1.27v3.11A11.99 11.99 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54V6.62H1.27a11.99 11.99 0 0 0 0 10.76z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42A11.6 11.6 0 0 0 12 0 11.99 11.99 0 0 0 1.27 6.62l4 3.11C6.22 6.88 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}
