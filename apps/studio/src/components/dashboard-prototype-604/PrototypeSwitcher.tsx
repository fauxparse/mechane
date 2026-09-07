// PROTOTYPE — issue #604 ("Redesign studio homepage"). Throwaway code.
//
// THE PLAN: variants of the studio dashboard, plus today's page for
// comparison, switchable via `?variant=` on the existing "/" route.
//
// Round 2 — the live set. Round 1 landed on "C as a starting point, with the
// table replaced with the cards from A", plus: New Show first in the list,
// search/filtering, Scene thumbnails that jump into the Canvas editor, a
// better-fitting main preview, and a live indicator that also wins the top
// spot. All three share that base and disagree about the two questions it
// left open — where the search controls live, and how "live" presents:
//
//   /?variant=d          Spotlight     — search in the chrome; the band
//                                        changes subject when a Run is up
//   /?variant=e          Stage manager — no band at all: the top spot is a
//                                        double-width grid cell, live is a
//                                        pinned status strip, and the filter
//                                        bar sticks to the grid
//   /?variant=f          Rundown       — the band is a Scene launcher, every
//                                        card carries its Scenes, and search
//                                        is a ⌘K palette over Shows *and*
//                                        Scenes rather than a filter control
//
// Round 1 — kept for reference, since round 2 is built out of its parts.
//
//   /?variant=a          Gallery   — preview-led card grid
//   /?variant=b          Workbench — Show rail beside a detail pane
//   /?variant=c          Marquee   — resume band over a dense table
//   /                    today's Show list, untouched
//
// When one wins: fold it into `routes/_authenticated/index.tsx` properly —
// this code has no tests, no error states worth the name, and previews that
// cost four requests per Show — then drop this directory from main and keep
// the full set on the throwaway branch.
import { Button, ChevronLeftIcon, ChevronRightIcon } from "@mechane/design-system";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const DASHBOARD_VARIANTS = [
  { key: "d", name: "Spotlight", round: 2 },
  { key: "e", name: "Stage manager", round: 2 },
  { key: "f", name: "Rundown", round: 2 },
  { key: "a", name: "Gallery", round: 1 },
  { key: "b", name: "Workbench", round: 1 },
  { key: "c", name: "Marquee", round: 1 },
  { key: "current", name: "Today's page", round: 0 },
] as const;

export type DashboardVariantKey = (typeof DASHBOARD_VARIANTS)[number]["key"];

export function isDashboardVariantKey(value: unknown): value is DashboardVariantKey {
  return DASHBOARD_VARIANTS.some((variant) => variant.key === value);
}

/** True while the user is typing, when arrow keys belong to the caret. */
function typing(): boolean {
  const active = document.activeElement;
  return (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  );
}

/** The search params for the variant `delta` steps along from `index`, wrapping. */
function searchForStep(index: number, delta: number) {
  const count = DASHBOARD_VARIANTS.length;
  const next = DASHBOARD_VARIANTS[(index + delta + count) % count] ?? DASHBOARD_VARIANTS[0];
  return next.key === "current" ? {} : { variant: next.key };
}

export interface PrototypeSwitcherProps {
  current: DashboardVariantKey;
}

export function PrototypeSwitcher({ current }: PrototypeSwitcherProps) {
  const navigate = useNavigate({ from: "/" });
  const index = DASHBOARD_VARIANTS.findIndex((variant) => variant.key === current);
  const variant = DASHBOARD_VARIANTS[index] ?? DASHBOARD_VARIANTS[0];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing()) return;
      const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      if (delta !== 0) void navigate({ search: searchForStep(index, delta), replace: true });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, navigate]);

  // A stray merge must not ship the bar to a director.
  if (import.meta.env.PROD) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-foreground py-1 pl-1 pr-1 text-background shadow-lg ring-1 ring-black/20">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous variant"
          className="rounded-full text-background hover:bg-background/20 hover:text-background"
          onClick={() => void navigate({ search: searchForStep(index, -1), replace: true })}
        >
          <ChevronLeftIcon />
        </Button>
        <span className="select-none px-2 font-mono text-xs tabular-nums">
          {variant.key === "current" ? "—" : variant.key.toUpperCase()}
          <span className="pl-2 font-sans opacity-70">{variant.name}</span>
          <span className="pl-2 opacity-40">
            {variant.round > 0 ? `#604 r${variant.round}` : "#604"}
          </span>
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next variant"
          className="rounded-full text-background hover:bg-background/20 hover:text-background"
          onClick={() => void navigate({ search: searchForStep(index, 1), replace: true })}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
