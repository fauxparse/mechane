// PROTOTYPE — issue #604. Throwaway; see ./PrototypeSwitcher.tsx for the plan.
//
// The ghost card from variant A, extracted because round 2 wants it "at the
// start of the list, so it's always reachable" in all three variants: first
// grid cell, so it never drifts below the fold as Shows accumulate.
//
// The card is only ever a plus now — naming happens in ./NewShowDialog, so
// the grid never reflows to make room for a form growing inside one cell.
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
          // Alpha-on-foreground rather than named surface/border tokens: this
          // card sits on `bg-sunken` in variant D and on `bg-background` in
          // variant A, and `border-border` is close enough to both to
          // disappear against them.
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
