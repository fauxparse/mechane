// The badges an account wears in the admin area: its role, and whether it is
// banned. Only non-default roles stand out; "user" is what everyone is.
import { Badge } from "@mechane/design-system";
import { DEFAULT_ROLE } from "@mechane/domain/access-control";

import type { AdminUser } from "./admin-user";

export function AccountBadges({ user, isSelf }: { user: AdminUser; isSelf?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge variant={user.role === DEFAULT_ROLE ? "muted" : "default"}>{user.role}</Badge>
      {user.banned ? <Badge variant="destructive">Banned</Badge> : null}
      {isSelf ? <Badge variant="outline">You</Badge> : null}
    </span>
  );
}
