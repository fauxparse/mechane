import * as React from "react";

import { cn } from "../../lib/utils";
import { useVibe, type Vibe } from "../inspector-vibe";

function Label({
  className,
  vibe: vibeProp,
  ...props
}: React.ComponentProps<"label"> & { vibe?: Vibe }) {
  const vibe = useVibe(vibeProp);
  return (
    <label
      data-slot="label"
      data-vibe={vibe}
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        vibe === "inspector" && "gap-1 text-xs",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
