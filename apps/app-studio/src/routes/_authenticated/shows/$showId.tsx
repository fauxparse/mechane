// The Show detail screen — "/shows/$showId". Rename or delete a single
// Show. `useShow` scopes to the signed-in user server-side (see
// apps/api/src/graphql/schema.ts's `show` resolver), so an id belonging to
// someone else resolves to null here rather than leaking its existence.
import { isId } from "@presence/domain";
import type { ShowId } from "@presence/domain";
import { Button } from "@presence/design-system";
import { GraphQLRequestError } from "@presence/graphql-schema";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { useDeleteShow, useRenameShow, useShow } from "../../../api/shows";
import { ShowNameForm } from "../../../components/ShowNameForm";

export const Route = createFileRoute("/_authenticated/shows/$showId")({
  component: ShowDetailRoute,
});

function ShowDetailRoute() {
  const params = Route.useParams();
  // The one place a Show id arrives from outside the system, so the one
  // place it gets validated (issue #47). An id that isn't well-formed
  // can't match any Show, and says so without a round trip.
  const showId: ShowId | null = isId("show", params.showId) ? params.showId : null;
  const navigate = useNavigate();
  const show = useShow(showId);
  const renameShow = useRenameShow();
  const deleteShow = useDeleteShow();

  if (showId !== null && show.isPending) {
    return <p>Loading…</p>;
  }

  if (showId === null || show.isError || !show.data) {
    return (
      <main>
        <p role="alert">This Show doesn't exist, or isn't yours.</p>
        <Link to="/">Back to Shows</Link>
      </main>
    );
  }

  const currentShow = show.data;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
        Back to Shows
      </Link>
      <h1 className="text-2xl font-semibold">{currentShow.name}</h1>

      <ShowNameForm
        key={currentShow.updatedAt}
        initialName={currentShow.name}
        submitLabel="Save"
        pending={renameShow.isPending}
        error={
          renameShow.error instanceof GraphQLRequestError ? renameShow.error.message : undefined
        }
        onSubmit={(name) => renameShow.mutate({ id: currentShow.id, name })}
      />

      <Button
        type="button"
        variant="destructive"
        className="self-start"
        disabled={deleteShow.isPending}
        onClick={() => {
          deleteShow.mutate(currentShow.id, {
            onSuccess: () => navigate({ to: "/" }),
          });
        }}
      >
        {deleteShow.isPending ? "Deleting…" : "Delete Show"}
      </Button>
    </main>
  );
}
