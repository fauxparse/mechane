// Shared form for both "create a Show" (empty initialName) and "rename a
// Show" (existing initialName) — same shape, same validation-error display,
// different submit label. Presentational: the route supplies onSubmit and
// any server-side error message (e.g. from @presence/domain's
// InvalidShowNameError, surfaced through the GraphQL error).
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
    <form className="show-name-form" onSubmit={handleSubmit}>
      <label className="show-name-form__label" htmlFor="show-name">
        Show name
      </label>
      <input
        id="show-name"
        className="show-name-form__input"
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        disabled={pending}
      />
      {error ? <p className="show-name-form__error">{error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
