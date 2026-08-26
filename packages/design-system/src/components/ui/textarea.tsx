import type { ComponentProps } from "react";

import { cn } from "../../lib/utils";
import { useVibe, type Vibe } from "../inspector-vibe";

function Textarea({
  className,
  vibe: vibeProp,
  ...props
}: ComponentProps<"textarea"> & { vibe?: Vibe }) {
  const vibe = useVibe(vibeProp);
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        vibe === "inspector" &&
          "min-h-40 resize-y rounded-sm border-0 bg-muted/50 px-2 py-1 text-[0.8rem] dark:bg-muted/50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
