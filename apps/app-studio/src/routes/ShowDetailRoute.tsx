// The Show detail screen — "/shows/$showId". Rename or delete a single
// Show. `useShow` scopes to the signed-in user server-side (see
// apps/api/src/graphql/schema.ts's `show` resolver), so an id belonging to
// someone else resolves to null here rather than leaking its existence.
import { GraphQLRequestError } from "@presence/graphql-schema";
import { Link, useNavigate, useParams } from "@tanstack/react-router";

import { useDeleteShow, useRenameShow, useShow } from "../api/shows";
import { ShowNameForm } from "../components/ShowNameForm";

export function ShowDetailRoute() {
  const { showId } = useParams({ from: "/shows/$showId" });
  const navigate = useNavigate();
  const show = useShow(showId);
  const renameShow = useRenameShow();
  const deleteShow = useDeleteShow();

  if (show.isPending) {
    return <p>Loading…</p>;
  }

  if (show.isError || !show.data) {
    return (
      <main>
        <p role="alert">This Show doesn't exist, or isn't yours.</p>
        <Link to="/">Back to Shows</Link>
      </main>
    );
  }

  const currentShow = show.data;

  return (
    <main className="show-detail">
      <Link to="/">Back to Shows</Link>
      <h1>{currentShow.name}</h1>

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

      <button
        type="button"
        disabled={deleteShow.isPending}
        onClick={() => {
          deleteShow.mutate(currentShow.id, {
            onSuccess: () => navigate({ to: "/" }),
          });
        }}
      >
        {deleteShow.isPending ? "Deleting…" : "Delete Show"}
      </button>
    </main>
  );
}
