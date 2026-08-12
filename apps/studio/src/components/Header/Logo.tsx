import { MechaneIcon, cn } from "@mechane/design-system";

export const Logo = ({ className }: { className?: string }) => {
  return <MechaneIcon className={cn("fill-foreground size-6", className)} />;
};
