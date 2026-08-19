import { ColorValue } from "@mechane/domain";
import { cn } from "../../lib/utils";
import { CSSProperties } from "react";

export const Swatch = ({
  className,
  color,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, "color"> & {
  color: ColorValue["value"];
}) => (
  <div
    className={cn("w-4 h-4 rounded-xs border border-border bg-(--color)", className)}
    style={{ "--color": color } as CSSProperties}
    {...props}
  />
);
