// Shared form for both "create a Show" (empty initialName) and "rename a
// Show" (existing initialName) — same shape, same validation-error display,
// different submit label. Presentational: the route supplies onSubmit and
// any server-side error message (e.g. from @presence/domain's
// InvalidShowNameError, surfaced through the GraphQL error). Built from
// @presence/design-system's Button/Input/Label primitives (issue #14)
// rather than raw <form>/<input>/<label> elements.
import { Button, Input, Label } from "@presence/design-system";
import { useState } from "react";
import type { FormEvent } from "react";

export interface ShowNameFormProps {
  initialName?: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
  pending?: boolean;
  error?: string;
}

export function ShowNameForm({
  initialName = "",
  submitLabel,
  onSubmit,
  pending,
  error,
}: ShowNameFormProps) {
  const [name, setName] = useState(initialName);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(name);
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="show-name">Show name</Label>
        <Input
          id="show-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={pending}
          aria-invalid={error ? true : undefined}
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
