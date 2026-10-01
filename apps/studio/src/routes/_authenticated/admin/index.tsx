// The admin area's list of accounts ("/admin", issue #826). Wiring only (see
// components/Admin/AdminUsers.tsx). The search box is local state, not a URL
// search param: a controlled input fed back through the router drops
// keystrokes typed faster than a navigation settles.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ADMIN_USERS_PAGE_SIZE, useAdminUsers } from "../../../api/admin";
import { useMe } from "../../../api/me";
import { AdminUsers } from "../../../components/Admin/AdminUsers";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminUsersRoute,
});

function AdminUsersRoute() {
  const me = useMe();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const users = useAdminUsers({ search, page });

  return (
    <AdminUsers
      users={users.data?.users ?? []}
      total={users.data?.total ?? 0}
      pending={users.isPending}
      loadError={users.isError ? users.error.message : undefined}
      search={search}
      onSearchChange={(next) => {
        setSearch(next);
        // A new search starts again from the first page.
        setPage(0);
      }}
      page={page}
      pageSize={ADMIN_USERS_PAGE_SIZE}
      onPageChange={setPage}
      currentUserId={me.data?.id ?? ""}
    />
  );
}
