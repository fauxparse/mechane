// That a Show has a Run up, at two densities (issue #604): the full badge with
// the Run's elapsed time for the band, and the bare dot where there is no room
// for words.
//
// Coloured with the `live` tokens, not `destructive`. A Show with a Run up is
// on air, not dangerous — `destructive` means "this will delete or break
// something", and spending it on a status indicator both misreports the state
// and devalues the colour where it does mean danger. See the `live` entry in
// the design system's scripts/theme-generator.ts.
import { cn } from "@mechane/design-system";
import { useEffect, useState } from "react";

import { elapsedSince } from "./elapsed";

export interface LiveBadgeProps {
  /** When the Run started, if the elapsed time is worth the space. */
  startedAt?: string;
  className?: string;
}

export function LiveBadge({ startedAt, className }: LiveBadgeProps) {
  // A Run timer that never moves reads as a broken clock rather than a live
  // Show, which defeats the point of the badge. Half-minute ticks are enough
  // for a display whose smallest unit is a minute after the first minute.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => tick((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-live px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-live-foreground",
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-current" />
      Live
      {startedAt ? (
        <span className="font-normal normal-case tabular-nums opacity-80">
          {elapsedSince(startedAt)}
        </span>
      ) : null}
    </span>
  );
}
