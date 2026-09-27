import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import {
  ArrowLeftIcon,
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  LockIcon,
  MailIcon,
} from "@mechane/design-system";

import { AuthCard } from "./AuthCard";
import { GuestAuthLayout } from "./GuestAuthLayout";

type PasswordResetPageProps = {
  title: string;
  description: string;
  footerLabel: string;
  footerTo: "/sign-in" | "/forgot-password";
  children?: ReactNode;
};

function PasswordResetPage({ title, description, footerLabel, footerTo, children }: PasswordResetPageProps) {
  return (
    <GuestAuthLayout>
      <div className="flex w-full max-w-sm flex-col items-center gap-3">
        <AuthCard
          title={title}
          description={description}
          footer={
            <Button
              variant="link"
              className="text-base"
              render={
                <Link to={footerTo}>
                  <ArrowLeftIcon className="size-4" />
                  <span>{footerLabel}</span>
                </Link>
              }
            />
          }
        >
          {children}
        </AuthCard>
      </div>
    </GuestAuthLayout>
  );
}

type ForgotPasswordScreenProps =
  | {
      state: "form";
      pending: boolean;
      error: string | null;
      onSubmit: (email: string) => void;
    }
  | { state: "sent" };

export function ForgotPasswordScreen(props: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState("");

  if (props.state === "sent") {
    return (
      <PasswordResetPage
        title="Check your inbox"
        description="If an account uses that email address, we sent a password reset link."
        footerLabel="Back to sign in"
        footerTo="/sign-in"
      />
    );
  }

  return (
    <PasswordResetPage
      title="Reset your password"
      description="Enter your email and we'll send you a reset link."
      footerLabel="Back to sign in"
      footerTo="/sign-in"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit(email);
        }}
      >
        <InputGroup size="lg" className="auth-form-email-field">
          <InputGroupAddon className="w-8">
            <MailIcon className="size-5 text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            type="email"
            autoComplete="email"
            placeholder="Email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={props.pending}
            required
          />
        </InputGroup>
        {props.error ? (
          <p role="alert" className="text-sm text-destructive">
            {props.error}
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          className="auth-form-submit w-full rounded-md h-10 text-lg"
          disabled={props.pending}
        >
          {props.pending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </PasswordResetPage>
  );
}

type ResetPasswordScreenProps =
  | { state: "invalid" }
  | { state: "completed" }
  | {
      state: "form";
      pending: boolean;
      error: string | null;
      onSubmit: (password: string) => void;
    };

export function ResetPasswordScreen(props: ResetPasswordScreenProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  if (props.state === "completed") {
    return (
      <PasswordResetPage
        title="Password updated"
        description="Your password has been changed. You can sign in now."
        footerLabel="Back to sign in"
        footerTo="/sign-in"
      />
    );
  }

  if (props.state === "invalid") {
    return (
      <PasswordResetPage
        title="That reset link is invalid"
        description="Request a new password reset link and try again."
        footerLabel="Request another link"
        footerTo="/forgot-password"
      />
    );
  }

  return (
    <PasswordResetPage
      title="Choose a new password"
      description="Use at least eight characters."
      footerLabel="Back to sign in"
      footerTo="/sign-in"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (password !== confirmation) {
            setValidationError("The passwords do not match.");
            return;
          }
          setValidationError(null);
          props.onSubmit(password);
        }}
      >
        <InputGroup size="lg" className="auth-form-password-field">
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
            disabled={props.pending}
            required
          />
        </InputGroup>
        <InputGroup size="lg" className="auth-form-password-field">
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
            disabled={props.pending}
            required
          />
        </InputGroup>
        {validationError || props.error ? (
          <p role="alert" className="text-sm text-destructive">
            {validationError ?? props.error}
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          className="auth-form-submit w-full rounded-md h-10 text-lg"
          disabled={props.pending}
        >
          {props.pending ? "Updating…" : "Update password"}
        </Button>
      </form>
    </PasswordResetPage>
  );
}
