// The post-login home base ("/", issues #13 and #604). Signed-out visitors
// never reach this component — the parent `_authenticated` layout's
// `beforeLoad` (_authenticated/route.tsx, issue #30) redirects them to
// /sign-in before it renders.
//
// Like the editor's `shows/$showId.tsx`, this route is the wiring and nothing
// else: it reads the Shows and the signed-in user, and hands Dashboard plain
// data and callbacks. What it deliberately does not own are the per-Show reads
// behind each card's preview, which belong to the components that display them
// (components/Dashboard/use-show-dossier.ts).
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ShowId } from "@mechane/domain";
import { GraphQLRequestError } from "@mechane/graphql-schema";

import { useSignOut } from "../../api/auth";
import { useMe } from "../../api/me";
import { useCreateShow, useDeleteShow, useShows } from "../../api/shows";
import { Dashboard } from "../../components/Dashboard/Dashboard";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardRoute,
});

function DashboardRoute() {
  const navigate = useNavigate();
  const me = useMe();
  const shows = useShows();
  const createShow = useCreateShow();
  const deleteShow = useDeleteShow();
  const signOut = useSignOut();

  const openShow = (showId: ShowId) => void navigate({ to: "/shows/$showId", params: { showId } });

  return (
    <Dashboard
      shows={shows.data ?? []}
      pending={shows.isPending}
      loadError={shows.isError ? shows.error.message : undefined}
      user={{
        id: me.data?.id ?? "unknown",
        name: me.data?.name,
        email: me.data?.email ?? "",
        avatarUrl: null,
      }}
      onLogOut={() => signOut.mutate()}
      onOpenShow={openShow}
      onOpenScene={(showId, artId) =>
        void navigate({ to: "/shows/$showId/art/$artId", params: { showId, artId } })
      }
      onCreateShow={(name) => createShow.mutate(name, { onSuccess: (show) => openShow(show.id) })}
      creating={createShow.isPending}
      // Only a validation failure is worth showing in the dialog; anything
      // else is not something renaming the Show would fix.
      createError={
        createShow.error instanceof GraphQLRequestError ? createShow.error.message : undefined
      }
      onDeleteShow={(showId) => deleteShow.mutate(showId)}
      deletingId={deleteShow.isPending ? (deleteShow.variables ?? null) : null}
    />
  );
}
