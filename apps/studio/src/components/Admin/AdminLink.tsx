// A link inside the admin area that needs no router in scope, so the admin
// screens render in Storybook as they are (see ../Header/Header.tsx for the
// same `href` + `onSelect` convention). A plain click navigates client-side;
// a modified or middle click is left to the browser, which opens the href.
import type { ComponentProps } from "react";

import { navigationIntentFor } from "../Header/header-navigation";
import type { AdminDestination } from "./admin-user";

export interface AdminLinkProps extends Omit<ComponentProps<"a">, "href"> {
  to: AdminDestination;
}

export function AdminLink({ to, onClick, ...props }: AdminLinkProps) {
  return (
    <a
      {...props}
      href={to.href}
      onClick={(event) => {
        onClick?.(event);
        if (navigationIntentFor(event) !== "navigate") return;
        event.preventDefault();
        to.onSelect();
      }}
    />
  );
}
