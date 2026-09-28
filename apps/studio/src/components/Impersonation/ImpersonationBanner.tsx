// The strip across the top of the viewport while an admin is impersonating
// someone (issue #845): who they are signed in as, and the way back to their
// own account. Presentational — the authenticated layout wires `onStop`.
import { Button, HatGlassesIcon } from "@mechane/design-system";

import "./impersonation-banner.css";

export interface ImpersonationBannerProps {
  /** The user being impersonated, i.e. who every request now runs as. */
  readonly user: { readonly name: string; readonly email: string };
  onStop(): void;
  readonly stopping: boolean;
  /** Why stopping failed, if it did. */
  readonly error?: string;
}

export function ImpersonationBanner({ user, onStop, stopping, error }: ImpersonationBannerProps) {
  return (
    // A fixed light yellow rather than `palette-yellow-fill`, which goes brown
    // in dark mode: the banner should read as a caution, not an alarm, in both.
    <aside
      data-impersonation-banner
      aria-label="Impersonation"
      className="sticky top-0 z-40 flex h-(--impersonation-banner-height) shrink-0 items-center justify-center gap-3 border-b border-(--palette-yellow-500) bg-(--palette-yellow-300) px-4 text-sm text-(--palette-yellow-950)"
    >
      <HatGlassesIcon aria-hidden="true" className="size-4 shrink-0" />
      <p className="min-w-0 truncate">
        You're impersonating <strong>{user.name || user.email}</strong>
        {user.name ? ` (${user.email})` : null}
      </p>
      {error ? (
        <p role="alert" className="shrink-0 font-medium">
          {error}
        </p>
      ) : null}
      <Button
        size="xs"
        variant="outline"
        className="shrink-0 border-current text-current hover:border-current hover:text-current"
        disabled={stopping}
        onClick={onStop}
      >
        {stopping ? "Stopping…" : "Stop impersonating"}
      </Button>
    </aside>
  );
}
