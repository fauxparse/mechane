import { SplashScreen } from "./join/SplashScreen";

/**
 * What a Custom Domain shows when it opens no Device: unknown, not live yet,
 * unbound, revoked, or blocked. Deliberately generic: it says nothing about
 * which of those it is. Distinct from the inactive-code state, which is for
 * a Device that resolves but has no active Run.
 */
export function HoldingPage({ busy = false }: { busy?: boolean }) {
  return (
    <SplashScreen>
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl bg-white/25 p-7 text-center shadow-xl inset-shadow-[0_1px_0_0_white]">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-700">Mechanē</p>
        <h1 className="text-2xl font-semibold text-neutral-950">
          {busy ? "Busy — try again in a moment" : "Nothing is playing here"}
        </h1>
        <p className="text-neutral-800">
          {busy
            ? "Lots of people are arriving at once."
            : "This address isn't showing anything right now."}
        </p>
      </div>
    </SplashScreen>
  );
}
