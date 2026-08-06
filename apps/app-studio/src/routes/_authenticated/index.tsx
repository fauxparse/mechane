// The post-login home base ("/", issue #13) — replaces the old bare
// ShowsListRoute with a proper layout: a header (wordmark, Settings, sign
// out) around the same Show list/create flow from issue #3. Signed-out
// visitors never reach this component — the parent `_authenticated`
// layout's `beforeLoad` (_authenticated/route.tsx, issue #30) redirects
// them to /sign-in before it renders.
import { GraphQLRequestError } from "@presence/graphql-schema";
import { Button, buttonVariants } from "@presence/design-system";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Settings } from "lucide-react";

import { useSignOut } from "../../api/auth";
import { useCreateShow, useDeleteShow, useShows } from "../../api/shows";
import { ShowListItem } from "../../components/ShowListItem";
import { ShowNameForm } from "../../components/ShowNameForm";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardRoute,
});

function DashboardRoute() {
  const navigate = useNavigate();
  const shows = useShows();
  const createShow = useCreateShow();
  const deleteShow = useDeleteShow();
  const signOut = useSignOut();

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="text-lg font-semibold tracking-tight">Presence</span>
        <nav className="flex items-center gap-2">
          <Link to="/settings" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <Settings /> Settings
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
          >
            {signOut.isPending ? "Signing out…" : "Sign out"}
          </Button>
        </nav>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-8 p-6 py-12">
        <div>
          <h1 className="text-2xl font-semibold">Your Shows</h1>
          <p className="text-muted-foreground">
            Pick up where you left off, or start something new.
          </p>
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

        {shows.isPending ? <p className="text-muted-foreground">Loading Shows…</p> : null}
        {shows.isError ? <p role="alert">Couldn't load Shows: {shows.error.message}</p> : null}

        {shows.data && shows.data.length === 0 ? (
          <p className="text-muted-foreground">No Shows yet — create one above.</p>
        ) : null}

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
    </div>
  );
}
