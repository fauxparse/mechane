// PROTOTYPE — issue #604. Throwaway; see ./PrototypeSwitcher.tsx for the plan.
//
// What a search with no matches looks like. It replaces the grid rather than
// sitting under it, and it takes the New Show card's job while it is up —
// two invitations to make a Show, one of them a dashed rectangle in a grid of
// nothing, is worse than one that says what happened.
//
// The dialog it opens is seeded with the search text: you typed a name,
// nothing had it, so the obvious next move is a Show with that name.
import { Button } from "@mechane/design-system";
import { useState } from "react";

import { NewShowDialog } from "./NewShowDialog";

export interface NoShowsFoundProps {
  /** What was searched for, if anything; empty when only a filter is on. */
  query: string;
  onCreate(name: string): void;
  creating: boolean;
  error?: string;
}

export function NoShowsFound({ query, onCreate, creating, error }: NoShowsFoundProps) {
  const [naming, setNaming] = useState(false);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 py-12 text-center">
      <EmptyStageIllustration />

      <div className="max-w-sm">
        <p className="text-lg font-medium">
          {query ? <>No Shows match “{query}”</> : <>No Shows match that filter</>}
        </p>
        <p className="pt-1 text-sm text-muted-foreground">
          {query
            ? "Check the spelling, or start a new Show under that name."
            : "Nothing here is live right now."}
        </p>
      </div>

      <Button onClick={() => setNaming(true)}>Create a new Show</Button>

      <NewShowDialog
        open={naming}
        onOpenChange={setNaming}
        initialName={query}
        onCreate={onCreate}
        creating={creating}
        error={error}
      />
    </div>
  );
}

/**
 * An empty Artboard under a magnifier. Drawn rather than imported because the
 * repo has no illustration set yet, and drawn in `currentColor` so it inherits
 * the muted foreground and survives a theme or palette change.
 */
function EmptyStageIllustration() {
  return (
    <svg
      viewBox="0 0 150 110"
      aria-hidden="true"
      className="h-28 w-auto text-muted-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      {/* The Artboard that has nothing on it. */}
      <rect x="9" y="14" width="94" height="66" rx="6" strokeDasharray="7 6" opacity="0.55" />
      {/* Two ghosts of Elements, to read as "a Scene, but empty". */}
      <line x1="24" y1="36" x2="66" y2="36" opacity="0.3" />
      <line x1="24" y1="50" x2="50" y2="50" opacity="0.3" />
      {/*
        The search that found none of them. The lens is filled with the surface
        it sits on so it masks the dashed Artboard behind it — `fill-background`
        would paint the wrong shade, since this empty state lives on the
        library half's `bg-sunken`.
      */}
      <circle cx="103" cy="70" r="22" className="fill-sunken stroke-none" />
      <circle cx="103" cy="70" r="22" />
      <line x1="119" y1="86" x2="136" y2="103" strokeWidth="3" />
    </svg>
  );
}
