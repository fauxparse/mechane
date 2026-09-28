// The admin area's front page (issue #826): every account, newest first, one
// page at a time. Presentational — the route owns the search and page state's
// persistence, the requests, and where each row leads.
import { Button, ChevronLeftIcon, ChevronRightIcon, SearchInput } from "@mechane/design-system";

import { relativeTime } from "../Dashboard/elapsed";
import { AccountBadges } from "./AccountBadges";
import { AdminLink } from "./AdminLink";
import type { AdminDestination, AdminUser } from "./admin-user";

export interface AdminUsersProps {
  readonly users: readonly AdminUser[];
  /** Every account matching the search, not just this page. */
  readonly total: number;
  readonly pending: boolean;
  readonly loadError?: string;
  readonly search: string;
  onSearchChange(search: string): void;
  /** Zero-based. */
  readonly page: number;
  readonly pageSize: number;
  onPageChange(page: number): void;
  readonly currentUserId: string;
  linkToUser(userId: string): AdminDestination;
}

export function AdminUsers({
  users,
  total,
  pending,
  loadError,
  search,
  onSearchChange,
  page,
  pageSize,
  onPageChange,
  currentUserId,
  linkToUser,
}: AdminUsersProps) {
  const first = page * pageSize + 1;
  const last = page * pageSize + users.length;
  const hasNextPage = last < total;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Users</h1>
        {pending ? <span className="text-sm text-muted-foreground">Loading users…</span> : null}
        <SearchInput
          className="ml-auto"
          placeholder="Search by email"
          value={search}
          onValueChange={onSearchChange}
        />
      </div>

      {loadError ? (
        <p role="alert" className="text-destructive">
          Couldn't load users: {loadError}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">
                User
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Access
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Joined
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-border last:border-b-0 hover:bg-muted/40"
              >
                <td className="px-4 py-2">
                  <AdminLink to={linkToUser(user.id)} className="flex flex-col hover:underline">
                    <span className="font-medium">{user.name || user.email}</span>
                    <span className="text-muted-foreground">{user.email}</span>
                  </AdminLink>
                </td>
                <td className="px-4 py-2">
                  <AccountBadges user={user} isSelf={user.id === currentUserId} />
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  <time dateTime={user.createdAt}>{relativeTime(user.createdAt)}</time>
                </td>
              </tr>
            ))}
            {users.length === 0 && !pending ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  {search.trim() ? `No users match “${search.trim()}”.` : "No users yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {total > 0 ? (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <span>
            {first}–{last} of {total}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous page"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next page"
            disabled={!hasNextPage}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      ) : null}
    </section>
  );
}
