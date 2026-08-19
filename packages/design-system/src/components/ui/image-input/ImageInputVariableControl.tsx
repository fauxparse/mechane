import type { ImageValue, VariableReference } from "@mechane/domain";
import { PlugIcon } from "lucide-react";

import { Button } from "../button";
import { cn } from "../../../lib/utils";
import { PopoverTrigger } from "../popover";

export type ImageInputVariableControlProps = {
  linkedVariable: VariableReference<ImageValue> | null;
};

export const ImageInputVariableControl = ({ linkedVariable }: ImageInputVariableControlProps) => (
  <PopoverTrigger
    render={
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className={cn(
          "pointer-events-auto",
          "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
          linkedVariable
            ? "max-w-40 gap-1 bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground"
            : "w-5 aspect-square bg-transparent hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        )}
        aria-label={
          linkedVariable ? `Connected variable: ${linkedVariable.name}` : "Connect variable"
        }
      >
        <PlugIcon className="size-4 shrink-0" aria-hidden="true" data-icon="inline-start" />
        {linkedVariable && <span className="truncate text-xs">{linkedVariable.name}</span>}
      </Button>
    }
  />
);
