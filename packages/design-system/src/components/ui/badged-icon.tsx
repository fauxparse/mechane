import { cva, VariantProps } from "class-variance-authority";
import { LucideIcon } from "lucide-react";
import { ComponentProps } from "react";
import { cn } from "../../lib/utils";

const BadgeVariants = cva(
  "absolute bg-(--badge-bg) text-(--badge-fg) rounded-full size-2/3 right-0 bottom-0 translate-1/4 shadow-[0_0_0_2px_var(--color-background)] *:stroke-3 *:scale-[0.75] *:origin-center",
  {
    variants: {
      badgeColor: {
        default: "[--badge-bg:var(--color-foreground)] [--badge-fg:var(--color-background)]",
        success: "[--badge-bg:var(--color-success)] [--badge-fg:white]",
        destructive: "[--badge-bg:var(--color-destructive)] [--badge-fg:white]",
      },
    },
    defaultVariants: {
      badgeColor: "default",
    },
  },
);

type BadgedIconProps = ComponentProps<LucideIcon> & {
  icon: LucideIcon;
  badge: LucideIcon;
} & VariantProps<typeof BadgeVariants>;

export const BadgedIcon = ({
  icon: Icon,
  badge: BadgeIcon,
  badgeColor,
  className,
  ...props
}: BadgedIconProps) => {
  const badgeProps = BadgeVariants({ badgeColor });

  return (
    <span className={cn("relative inline-block size-6 shrink-0 text-muted-foreground", className)}>
      <Icon className="size-full" {...props} />
      <BadgeIcon className={badgeProps} />
    </span>
  );
};
