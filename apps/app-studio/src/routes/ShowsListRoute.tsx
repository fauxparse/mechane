// The Show list screen — root route ("/"). Create, list, and delete a
// Show; renaming happens on the detail screen (ShowDetailRoute).
import { GraphQLRequestError } from "@presence/graphql-schema";
import { Link, useNavigate } from "@tanstack/react-router";

import { useMe } from "../api/me";
import { useCreateShow, useDeleteShow, useShows } from "../api/shows";
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
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Shows</h1>
        <Link to="/settings" className="text-sm text-muted-foreground hover:text-foreground">
          Settings
        </Link>
      </div>

      <ShowNameForm
        key={createShow.isSuccess ? createShow.data.id : "new"}
        submitLabel="Create Show"
        pending={createShow.isPending}
        error={
          createShow.error instanceof GraphQLRequestError ? createShow.error.message : undefined
        }
        onSubmit={(name) => createShow.mutate(name)}
      />

      {shows.isPending ? <p>Loading Shows…</p> : null}
      {shows.isError ? <p role="alert">Couldn't load Shows: {shows.error.message}</p> : null}

      {shows.data && shows.data.length === 0 ? <p>No Shows yet — create one above.</p> : null}

      {shows.data && shows.data.length > 0 ? (
        <ul className="flex flex-col">
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
