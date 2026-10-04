import { Button, cn, LucideIcon } from "@mechane/design-system";
import { ComponentProps } from "react";

type NodeActionButtonProps = ComponentProps<typeof Button> & { icon?: LucideIcon };

export const NodeActionButton = ({
  icon: Icon,
  className,
  children,
  ...props
}: NodeActionButtonProps) => (
  <Button
    type="button"
    size="sm"
    variant="outline"
    className={cn(
      "nodrag w-full rounded-sm border-(--flow-border) text-(--flow-muted-foreground) hover:border-(--flow-border) hover:text-(--flow-muted-foreground) hover:bg-(--flow-area-background)",
      className,
    )}
    {...props}
  >
    {Icon && <Icon />}
    {children}
  </Button>
);
