// The post-login home base ("/", issue #13) — replaces the old bare
// ShowsListRoute with a proper layout: a header (wordmark, Settings, sign
// out) around the same Show list/create flow from issue #3. Signed-out
// visitors never reach this component — the parent `_authenticated`
// layout's `beforeLoad` (_authenticated/route.tsx, issue #30) redirects
// them to /sign-in before it renders.
//
// PROTOTYPE (issue #604, throwaway): `?variant=a|b|c` swaps the body for one
// of three redesign proposals while the data fetching, auth and mutations
// below stay exactly as they are. No param renders today's page unchanged, so
// the comparison includes the thing being replaced. Everything the variants
// need lives in ../../components/dashboard-prototype-604, and that directory
// plus this route's `variant` handling comes back out once one of them wins.
import { GraphQLRequestError } from "@mechane/graphql-schema";
import { Button, buttonVariants } from "@mechane/design-system";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Settings } from "@mechane/design-system";
import type { ShowId } from "@mechane/domain";

import { useSignOut } from "../../api/auth";
import { useMe } from "../../api/me";
import { useCreateShow, useDeleteShow, useShows } from "../../api/shows";
import { ShowListItem } from "../../components/ShowListItem";
import { ShowNameForm } from "../../components/ShowNameForm";
import {
  isDashboardVariantKey,
  PrototypeSwitcher,
} from "../../components/dashboard-prototype-604/PrototypeSwitcher";
import type { DashboardVariantKey } from "../../components/dashboard-prototype-604/PrototypeSwitcher";
import { VariantGallery } from "../../components/dashboard-prototype-604/VariantGallery";
import { VariantMarquee } from "../../components/dashboard-prototype-604/VariantMarquee";
import { VariantRundown } from "../../components/dashboard-prototype-604/VariantRundown";
import { VariantSpotlight } from "../../components/dashboard-prototype-604/VariantSpotlight";
import { VariantStageManager } from "../../components/dashboard-prototype-604/VariantStageManager";
import { VariantWorkbench } from "../../components/dashboard-prototype-604/VariantWorkbench";
import type { DashboardVariantProps } from "../../components/dashboard-prototype-604/variant-props";

export const Route = createFileRoute("/_authenticated/")({
  validateSearch: (search: Record<string, unknown>): { variant?: DashboardVariantKey } =>
    isDashboardVariantKey(search.variant) ? { variant: search.variant } : {},
  component: DashboardRoute,
});

function DashboardRoute() {
  const navigate = useNavigate();
  const { variant = "current" } = Route.useSearch();
  const me = useMe();
  const shows = useShows();
  const createShow = useCreateShow();
  const deleteShow = useDeleteShow();
  const signOut = useSignOut();

  const openShow = (showId: ShowId) => void navigate({ to: "/shows/$showId", params: { showId } });
  const createError =
    createShow.error instanceof GraphQLRequestError ? createShow.error.message : undefined;

  if (variant !== "current") {
    const props: DashboardVariantProps = {
      shows: shows.data ?? [],
      pending: shows.isPending,
      loadError: shows.isError ? shows.error.message : undefined,
      user: {
        id: me.data?.id ?? "unknown",
        name: me.data?.name,
        email: me.data?.email ?? "",
        avatarUrl: null,
      },
      onLogOut: () => signOut.mutate(),
      onOpen: openShow,
      onOpenScene: (showId, artId) =>
        void navigate({ to: "/shows/$showId/art/$artId", params: { showId, artId } }),
      onCreate: (name) => createShow.mutate(name, { onSuccess: (show) => openShow(show.id) }),
      creating: createShow.isPending,
      createError,
      onDelete: (showId) => deleteShow.mutate(showId),
      deletingId: deleteShow.isPending ? (deleteShow.variables ?? null) : null,
    };

    return (
      <>
        {variant === "d" ? <VariantSpotlight {...props} /> : null}
        {variant === "e" ? <VariantStageManager {...props} /> : null}
        {variant === "f" ? <VariantRundown {...props} /> : null}
        {variant === "a" ? <VariantGallery {...props} /> : null}
        {variant === "b" ? <VariantWorkbench {...props} /> : null}
        {variant === "c" ? <VariantMarquee {...props} /> : null}
        <PrototypeSwitcher current={variant} />
      </>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="text-lg font-semibold tracking-tight">Mechanē</span>
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
          error={createError}
          onSubmit={(name) =>
            createShow.mutate(name, {
              onSuccess: (show) => navigate({ to: "/shows/$showId", params: { showId: show.id } }),
            })
          }
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

      <PrototypeSwitcher current="current" />
    </div>
  );
}
