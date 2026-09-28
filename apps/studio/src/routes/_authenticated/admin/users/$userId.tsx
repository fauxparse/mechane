// One account in the admin area ("/admin/users/$userId", issue #826): wiring
// only — the account and its Shows come from ../../../../api/admin.ts, and
// components/Admin/AdminUserDetail.tsx draws them.
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import {
  useAdminDeleteShow,
  useAdminUser,
  useBanUser,
  useRemoveUser,
  useSetUserRole,
  useUnbanUser,
  useUserShows,
} from "../../../../api/admin";
import { useMe } from "../../../../api/me";
import { AdminUserDetail } from "../../../../components/Admin/AdminUserDetail";

export const Route = createFileRoute("/_authenticated/admin/users/$userId")({
  component: AdminUserRoute,
});

function AdminUserRoute() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const me = useMe();
  const user = useAdminUser(userId);
  const shows = useUserShows(userId);
  const setRole = useSetUserRole();
  const ban = useBanUser();
  const unban = useUnbanUser();
  const remove = useRemoveUser();
  const deleteShow = useAdminDeleteShow(userId);

  const backToUsers = () => void navigate({ to: "/admin" });
  const actionError = [setRole, ban, unban, remove, deleteShow].find((mutation) => mutation.isError)
    ?.error?.message;

  return (
    <AdminUserDetail
      back={{ href: "/admin", onSelect: backToUsers }}
      user={user.data}
      pending={user.isPending}
      loadError={user.isError ? user.error.message : undefined}
      isSelf={me.data?.id === userId}
      onSetRole={(role) => setRole.mutate({ userId, role })}
      settingRole={setRole.isPending}
      onBan={() => ban.mutate(userId)}
      onUnban={() => unban.mutate(userId)}
      banPending={ban.isPending || unban.isPending}
      onRemove={() => remove.mutate(userId, { onSuccess: backToUsers })}
      removing={remove.isPending}
      actionError={actionError}
      shows={shows.data ?? []}
      showsPending={shows.isPending}
      showsError={shows.isError ? shows.error.message : undefined}
      onDeleteShow={(showId) => deleteShow.mutate(showId)}
      deletingShowId={deleteShow.isPending ? (deleteShow.variables ?? null) : null}
    />
  );
}
