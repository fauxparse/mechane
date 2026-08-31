// The sign-in/sign-up form (issue #13) — one component for both modes since
// they're the same shape (email/password, an optional name field, a
// Google button) with different copy and a mode toggle, rather than two
// near-duplicate screens. Presentational, like ShowNameForm: the route
// (SignInRoute) wires onSubmit/onGoogleSignIn to Better Auth's client and
// supplies pending/error state. Built entirely from
// @mechane/design-system primitives — no raw <input>/<button>.
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  LockIcon,
  MailIcon,
  UserRoundIcon,
} from "@mechane/design-system";
import type { SubmitEvent } from "react";
import { useId, useState } from "react";

import "./AuthForm.css";

function runViewTransition(update: () => void) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    update();
    return;
  }

  const prefersReducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const startViewTransition = (
    document as Document & {
      startViewTransition?: (callback: () => void) => unknown;
    }
  ).startViewTransition;

  if (prefersReducedMotion || !startViewTransition) {
    update();
    return;
  }

  startViewTransition.call(document, update);
}

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

const COPY: Record<
  AuthMode,
  { title: string; description: string; submitLabel: string; switchLabel: string }
> = {
  "sign-in": {
    title: "Welcome back",
    description: "Sign in to pick up your shows where you left off.",
    submitLabel: "Sign in",
    switchLabel: "Don't have an account? Sign up",
  },
  "sign-up": {
    title: "Create your account",
    description: "Start building interactive tech for your next show.",
    submitLabel: "Create account",
    switchLabel: "Already have an account? Sign in",
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

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({ name, email, password });
  };

  return (
    <Card
      size="lg"
      className={cn(
        "auth-form-card rounded-xl bg-muted/30 p-2 shadow-xl gap-0 backdrop-blur-lg",
        className,
      )}
    >
      <CardContent className="flex flex-col gap-5 bg-muted/30 rounded-md shadow-md inset-shadow-[0_1px_0_0_rgba(255,255,255,0.15)] pb-(--card-spacing)">
        <CardHeader className="px-0 pt-(--card-spacing)">
          <CardTitle className="auth-form-title text-xl">
            <span>{copy.title}</span>
          </CardTitle>
          <CardDescription className="auth-form-description">
            <span>{copy.description}</span>
          </CardDescription>
        </CardHeader>
        {googleEnabled ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full rounded-md h-10 text-base border-2"
              onClick={onGoogleSignIn}
              disabled={googlePending}
            >
              <GoogleIcon />
              {googlePending ? "Connecting…" : "Continue with Google"}
            </Button>

            <div className="flex items-center gap-3 text-sm uppercase tracking-widest text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {mode === "sign-up" ? (
            <InputGroup size="lg" className="auth-form-name-field">
              <InputGroupAddon className="w-8">
                <UserRoundIcon className="size-5 text-muted-foreground" />
              </InputGroupAddon>
              <InputGroupInput
                id={`${formId}-name`}
                type="text"
                autoComplete="name"
                placeholder="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={pending}
                required
              />
            </InputGroup>
          ) : null}

          <InputGroup size="lg" className="auth-form-email-field">
            <InputGroupAddon className="w-8">
              <MailIcon className="size-5 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              id={`${formId}-email`}
              type="email"
              placeholder="Email address"
              autoComplete="email"
              autoFocus={mode === "sign-in" || undefined}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
              aria-invalid={error ? true : undefined}
              required
            />
          </InputGroup>

          <InputGroup size="lg" className="auth-form-password-field">
            <InputGroupAddon className="w-8">
              <LockIcon className="size-5 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              id={`${formId}-password`}
              type="password"
              placeholder="Password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={pending}
              aria-invalid={error ? true : undefined}
              required
              minLength={8}
            />
          </InputGroup>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            className="auth-form-submit w-full rounded-md h-10 text-lg"
            disabled={pending}
          >
            <span>{pending ? "One moment…" : copy.submitLabel}</span>
          </Button>
        </form>
      </CardContent>

      <CardFooter className="auth-form-footer flex-col p-(--card-spacing) border-t-0 bg-transparent">
        <Button
          type="button"
          variant="link"
          className="text-base"
          onClick={() => runViewTransition(onToggleMode)}
        >
          <span>{copy.switchLabel}</span>
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
