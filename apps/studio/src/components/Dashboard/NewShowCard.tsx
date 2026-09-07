// The invitation to start a Show, at the head of the grid (issue #604).
//
// First grid cell, so it never drifts below the fold as Shows accumulate, and
// only ever a plus: naming happens in ./NewShowDialog, so the grid never
// reflows to make room for a form growing inside one cell.
import { cn, PlusIcon } from "@mechane/design-system";
import { useState } from "react";

import { NewShowDialog } from "./NewShowDialog";

export interface NewShowCardProps {
  onCreate(name: string): void;
  creating: boolean;
  error?: string;
  className?: string;
}

export function NewShowCard({ onCreate, creating, error, className }: NewShowCardProps) {
  const [naming, setNaming] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setNaming(true)}
        className={cn(
          // Alpha-on-foreground rather than `border-border`, which resolves to
          // very nearly the colour `bg-sunken` uses — the dashed edge would
          // disappear against the surface this card actually sits on.
          "grid min-h-48 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-foreground/25 text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          className,
        )}
      >
        <span className="flex flex-col items-center gap-2">
          <PlusIcon className="size-6" />
          <span className="text-sm font-medium">New Show</span>
        </span>
      </button>

      <NewShowDialog
        open={naming}
        onOpenChange={setNaming}
        onCreate={onCreate}
        creating={creating}
        error={error}
      />
    </>
  );
}
