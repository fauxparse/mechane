// The Show list screen — root route ("/"). Create, list, and delete a
// Show; renaming happens on the detail screen (ShowDetailRoute).
import { GraphQLRequestError } from "@presence/graphql-schema";
import { useNavigate } from "@tanstack/react-router";

import { useCreateShow, useDeleteShow, useShows } from "../api/shows";
import { useMe } from "../api/me";
import { ShowListItem } from "../components/ShowListItem";
import { ShowNameForm } from "../components/ShowNameForm";

export function ShowsListRoute() {
  const navigate = useNavigate();
  const me = useMe();
  const shows = useShows();
  const createShow = useCreateShow();
  const deleteShow = useDeleteShow();

  if (me.isPending) {
    return <p>Loading…</p>;
  }

  if (!me.data) {
    return <p>Sign in to view your Shows.</p>;
  }

  return (
    <main className="shows-list">
      <h1>Shows</h1>

      <ShowNameForm
        key={createShow.isSuccess ? createShow.data.id : "new"}
        submitLabel="Create Show"
        pending={createShow.isPending}
        error={
          createShow.error instanceof GraphQLRequestError
            ? createShow.error.message
            : undefined
        }
        onSubmit={(name) => createShow.mutate(name)}
      />

      {shows.isPending ? <p>Loading Shows…</p> : null}
      {shows.isError ? <p role="alert">Couldn't load Shows: {shows.error.message}</p> : null}

      {shows.data && shows.data.length === 0 ? <p>No Shows yet — create one above.</p> : null}

      {shows.data && shows.data.length > 0 ? (
        <ul className="shows-list__items">
          {shows.data.map((show) => (
            <ShowListItem
              key={show.id}
              name={show.name}
              updatedAt={show.updatedAt}
              onOpen={() => navigate({ to: "/shows/$showId", params: { showId: show.id } })}
              onDelete={() => deleteShow.mutate(show.id)}
              deleting={deleteShow.isPending && deleteShow.variables === show.id}
            />
          ))}
        </ul>
      ) : null}
    </main>
  );
}
