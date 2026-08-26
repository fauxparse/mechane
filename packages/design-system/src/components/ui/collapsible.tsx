import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";

import { cn } from "../../lib/utils";

const Collapsible = CollapsiblePrimitive.Root;

function CollapsibleTrigger({ className, ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function CollapsibleContent({ className, ...props }: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      className={cn("overflow-hidden text-sm", className)}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
