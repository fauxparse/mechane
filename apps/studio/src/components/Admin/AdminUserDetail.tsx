// One account in the admin area (issue #826): who it is, what it may do, and
// the Shows it owns. Presentational — the route wires every callback to a
// request (../../api/admin.ts), and the API checks each one against the
// caller's role whatever this screen offers.
//
// An admin cannot change their own role, ban themselves, or delete their own
// account from here: each would be a one-click way to lock the last admin out.
// Better Auth refuses self-bans and self-removal anyway; the role is ours.
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  ArrowLeftIcon,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Trash2Icon,
} from "@mechane/design-system";
import { isRole, type Role, ROLES } from "@mechane/domain/access-control";
import { useState } from "react";

import { DeleteShowDialog } from "../Dashboard/DeleteShowDialog";
import { relativeTime } from "../Dashboard/elapsed";
import { AccountBadges } from "./AccountBadges";
import { AdminLink } from "./AdminLink";
import type { AdminDestination, AdminUser } from "./admin-user";

export interface AdminShow {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserDetailProps {
  readonly back: AdminDestination;
  readonly user: AdminUser | undefined;
  readonly pending: boolean;
  readonly loadError?: string;
  /** The account being shown belongs to whoever is looking at it. */
  readonly isSelf: boolean;
  onSetRole(role: Role): void;
  readonly settingRole: boolean;
  onBan(): void;
  onUnban(): void;
  readonly banPending: boolean;
  onRemove(): void;
  readonly removing: boolean;
  /** Why the last account action failed, if it did. */
  readonly actionError?: string;
  readonly shows: readonly AdminShow[];
  readonly showsPending: boolean;
  readonly showsError?: string;
  onDeleteShow(showId: string): void;
  readonly deletingShowId: string | null;
}

type Confirming = { kind: "ban" } | { kind: "remove" } | { kind: "show"; show: AdminShow };

export function AdminUserDetail({
  back,
  user,
  pending,
  loadError,
  isSelf,
  onSetRole,
  settingRole,
  onBan,
  onUnban,
  banPending,
  onRemove,
  removing,
  actionError,
  shows,
  showsPending,
  showsError,
  onDeleteShow,
  deletingShowId,
}: AdminUserDetailProps) {
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const closeDialog = (open: boolean) => {
    if (!open) setConfirming(null);
  };
  const showCount = `${shows.length} ${shows.length === 1 ? "Show" : "Shows"}`;

  return (
    <section className="flex flex-col gap-6">
      <AdminLink
        to={back}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        All users
      </AdminLink>

      {loadError ? (
        <p role="alert" className="text-destructive">
          Couldn't load this user: {loadError}
        </p>
      ) : null}
      {pending ? <p className="text-sm text-muted-foreground">Loading user…</p> : null}

      {user ? (
        <>
          <header className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold">{user.name || user.email}</h1>
            <p className="text-muted-foreground">
              {user.email} · joined{" "}
              <time dateTime={user.createdAt}>{relativeTime(user.createdAt)}</time>
            </p>
            <AccountBadges user={user} isSelf={isSelf} />
          </header>

          <section className="flex flex-col gap-3" aria-labelledby="admin-account-heading">
            <h2 id="admin-account-heading" className="text-lg font-medium">
              Account
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={user.role}
                disabled={isSelf || settingRole}
                onValueChange={(value) => {
                  if (typeof value === "string" && isRole(value) && value !== user.role) {
                    onSetRole(value);
                  }
                }}
              >
                <SelectTrigger className="w-36" aria-label="Role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {user.banned ? (
                <Button variant="outline" disabled={isSelf || banPending} onClick={onUnban}>
                  {banPending ? "Unbanning…" : "Unban"}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={isSelf || banPending}
                  onClick={() => setConfirming({ kind: "ban" })}
                >
                  {banPending ? "Banning…" : "Ban"}
                </Button>
              )}
              <Button
                variant="destructive"
                disabled={isSelf || removing}
                onClick={() => setConfirming({ kind: "remove" })}
              >
                {removing ? "Deleting…" : "Delete user"}
              </Button>
            </div>
            {isSelf ? (
              <p className="text-sm text-muted-foreground">
                You can't change your own role, ban yourself, or delete your own account here.
              </p>
            ) : null}
            {actionError ? (
              <p role="alert" className="text-sm text-destructive">
                {actionError}
              </p>
            ) : null}
          </section>
        </>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="admin-shows-heading">
        <h2 id="admin-shows-heading" className="text-lg font-medium">
          Shows
          {showsPending ? null : (
            <span className="ml-2 text-sm font-normal text-muted-foreground">{showCount}</span>
          )}
        </h2>
        {showsError ? (
          <p role="alert" className="text-destructive">
            Couldn't load Shows: {showsError}
          </p>
        ) : null}
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Name
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Updated
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Created
                </th>
                <th scope="col" className="px-4 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shows.map((show) => (
                <tr key={show.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 font-medium">{show.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    <time dateTime={show.updatedAt}>{relativeTime(show.updatedAt)}</time>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    <time dateTime={show.createdAt}>{relativeTime(show.createdAt)}</time>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deletingShowId === show.id}
                      onClick={() => setConfirming({ kind: "show", show })}
                    >
                      <Trash2Icon />
                      {deletingShowId === show.id ? "Deleting…" : "Delete"}
                    </Button>
                  </td>
                </tr>
              ))}
              {shows.length === 0 && !showsPending ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No Shows.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <DeleteShowDialog
        name={confirming?.kind === "show" ? confirming.show.name : ""}
        open={confirming?.kind === "show"}
        onOpenChange={closeDialog}
        onConfirm={() => {
          if (confirming?.kind === "show") onDeleteShow(confirming.show.id);
          setConfirming(null);
        }}
        blastRadius="Its Scenes, Devices and Runs"
      />

      <AlertDialog open={confirming?.kind === "ban"} onOpenChange={closeDialog}>
        <AlertDialogContent>
          <AlertDialogTitle>Ban {user?.name || user?.email}?</AlertDialogTitle>
          <AlertDialogDescription>
            They will be signed out everywhere and unable to sign in until they are unbanned. Their
            Shows are kept.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                onBan();
                setConfirming(null);
              }}
            >
              Ban user
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirming?.kind === "remove"} onOpenChange={closeDialog}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete {user?.name || user?.email}?</AlertDialogTitle>
          <AlertDialogDescription>
            Their account and {showsPending ? "all their Shows" : `their ${showCount}`} go with it.
            This cannot be undone.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                onRemove();
                setConfirming(null);
              }}
            >
              Delete user
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
