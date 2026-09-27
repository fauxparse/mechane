// The waitlist sign-up for prospective users. Presentational: the caller
// sends the address and reports back through `status`.
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  MailIcon,
} from "@mechane/design-system";
import type { SubmitEvent } from "react";
import { useState } from "react";

export type WaitlistStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "joined"; email: string }
  | { kind: "failed"; message: string };

export interface WaitlistFormProps {
  status: WaitlistStatus;
  onJoin: (email: string) => void;
}

export function WaitlistForm({ status, onJoin }: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const submitting = status.kind === "submitting";

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    onJoin(email);
  };

  return (
    <Card size="lg" className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">Join the waitlist</CardTitle>
        <CardDescription className="text-base">
          We’re still working on getting Mechanē ready for use in real shows. Join the waitlist and
          we’ll keep you updated.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status.kind === "joined" ? (
          <p role="status" className="text-base">
            You're on the list. We'll write to <strong>{status.email}</strong>.
          </p>
        ) : (
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
            <InputGroup size="lg" className="flex-1">
              <InputGroupAddon className="w-8">
                <MailIcon className="size-5 text-muted-foreground" />
              </InputGroupAddon>
              <InputGroupInput
                type="email"
                aria-label="Email address"
                placeholder="Email address"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={submitting}
                aria-invalid={status.kind === "failed" || undefined}
                required
              />
            </InputGroup>
            <Button type="submit" size="lg" className="h-10 px-4 text-base" disabled={submitting}>
              {submitting ? "Joining…" : "Join"}
            </Button>
          </form>
        )}
        {status.kind === "failed" ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {status.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
