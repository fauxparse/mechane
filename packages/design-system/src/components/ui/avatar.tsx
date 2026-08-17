import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { useId, useMemo, type ComponentProps } from "react";
import { Style, Avatar as DiceBearAvatar } from "@dicebear/core";
import definition from "@dicebear/styles/line-face.json" with { type: "json" };

import { cn } from "../../lib/utils";

function Avatar({
  className,
  size = "default",
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: "default" | "sm" | "lg";
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten",
        className,
      )}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full rounded-full object-cover", className)}
      {...props}
    />
  );
}

const AVATAR_STYLE = new Style(definition);

function AvatarFallback({
  className,
  id: providedId,
  delay,
  children,
  ...props
}: Omit<ComponentProps<"img">, "src"> & {
  id?: string;
  delay?: AvatarPrimitive.Fallback.Props["delay"];
}) {
  const fallbackId = useId();
  const id = providedId || (typeof children === "string" ? children : fallbackId);

  const avatar = useMemo(
    () =>
      new DiceBearAvatar(AVATAR_STYLE, {
        seed: id,
        backgroundColor: ["ffe3ea", "e3edff", "e2f5e9", "fdf1d4", "efe6ff"],
      }),
    [id],
  );

  return (
    <AvatarPrimitive.Fallback
      delay={delay}
      render={
        <img
          data-slot="avatar-fallback"
          className={cn("flex size-full rounded-full", className)}
          src={avatar.toDataUri()}
          alt=""
          {...props}
        />
      }
    />
  );
}

function AvatarBadge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroupCount({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarBadge };
