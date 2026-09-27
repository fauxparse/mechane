// The way into Studio for people who already have an account: a sign-in link,
// or a dashboard link when the visitor's Studio session is still live.
import { buttonVariants } from "@mechane/design-system";

export type StudioSession =
  | { kind: "checking" }
  | { kind: "signed-out" }
  | { kind: "signed-in"; name: string };

export interface StudioAccessProps {
  session: StudioSession;
  signInUrl: string;
  dashboardUrl: string;
}

export function StudioAccess({ session, signInUrl, dashboardUrl }: StudioAccessProps) {
  switch (session.kind) {
    case "checking":
      // Nothing until the session check settles, so a signed-in visitor never
      // sees a sign-in link flash past.
      return null;
    case "signed-out":
      return (
        <a href={signInUrl} className={buttonVariants({ variant: "outline", size: "lg" })}>
          Sign in
        </a>
      );
    case "signed-in":
      return (
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            Signed in as {session.name}
          </span>
          <a href={dashboardUrl} className={buttonVariants({ size: "lg" })}>
            Go to dashboard
          </a>
        </div>
      );
    default: {
      const _exhaustive: never = session;
      return _exhaustive;
    }
  }
}
