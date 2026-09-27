// The whole apex-domain page: what Mechanē is, the way into Studio for
// existing users, and the waitlist for everyone else. Presentational; App
// supplies the session and waitlist state.
import { MechaneIcon } from "@mechane/design-system";

import { StudioAccess, type StudioAccessProps } from "./StudioAccess";
import { WaitlistForm, type WaitlistFormProps } from "./WaitlistForm";

export interface HoldingPageProps {
  studio: StudioAccessProps;
  waitlist: WaitlistFormProps;
}

export function HoldingPage({ studio, waitlist }: HoldingPageProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-20 items-center justify-between gap-4 px-6 sm:px-12">
        <div className="flex items-center gap-2">
          <MechaneIcon className="size-8" />
          <span className="text-xl font-semibold tracking-tight">Mechanē</span>
        </div>
        <StudioAccess {...studio} />
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-16 sm:px-12">
        <div className="flex w-full max-w-xl flex-col gap-10">
          <div className="flex flex-col gap-4">
            <h1 className="text-4xl leading-tight font-semibold text-balance sm:text-5xl">
              Lift your theatre game.
            </h1>
            <p className="text-lg leading-relaxed text-muted-foreground text-balance">
              Mechanē is where you build the interactive parts of a show. Design scenes for the
              projectors, laptops, and audience phones in the room, wire them together, and run the
              whole thing live from the operator's desk.
            </p>
          </div>
          <WaitlistForm {...waitlist} />
        </div>
      </main>

      <footer className="px-6 py-6 text-sm text-muted-foreground sm:px-12">
        &copy; {new Date().getFullYear()} Mechanē
      </footer>
    </div>
  );
}
