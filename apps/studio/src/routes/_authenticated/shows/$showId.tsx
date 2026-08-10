// The shared Show editor layout for "/shows/$showId" (issue #39).
//
// The index child owns the Show Editor, while art.tsx owns the Canvas editor.
// Keeping those editors in sibling routes lets TanStack Router select the
// correct surface instead of making the layout inspect pathname strings or
// render one editor beside the other.
//
// This route is the only place in the editor that touches hooks: it reads the
// Show, the graphs, the run, and the signed-in user, and hands EditorLayout
// plain data and callbacks. That is what lets the whole Chrome be reviewed in
// Storybook with no router and no query client.
import { isId, publishState } from "@mechane/domain";
import type { ShowId } from "@mechane/domain";
import { GraphQLRequestError } from "@mechane/graphql-schema";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { usePublishShowGraph, useShowGraph } from "../../../api/show-graph";
import { useActiveRun, useEndRun, useStartRun } from "../../../api/runs";
import { useRenameShow, useShow } from "../../../api/shows";
import { useSignOut } from "../../../api/auth";
import { useMe } from "../../../api/me";
import { EditorLayout } from "../../../components/EditorLayout/EditorLayout";
import { useStoredSidebarState } from "../../../components/EditorLayout/use-stored-sidebar-state";
import type { EditorKind } from "../../../components/Header/Header";

export const Route = createFileRoute("/_authenticated/shows/$showId")({
  component: ShowEditorLayout,
});

function ShowEditorLayout() {
  const params = Route.useParams();
  // The one place a Show id arrives from outside the system, so the one
  // place it gets validated (issue #47).
  const showId: ShowId | null = isId("show", params.showId) ? params.showId : null;
  const navigate = useNavigate();
  const show = useShow(showId);
  const me = useMe();
  // Both graph states feed the publish badge. The index child owns the draft
  // snapshot used by the graph command stack.
  const draft = useShowGraph(showId, "draft");
  const published = useShowGraph(showId, "published");
  const activeRun = useActiveRun(showId);
  const renameShow = useRenameShow();
  const publish = usePublishShowGraph();
  const startRun = useStartRun();
  const endRun = useEndRun();
  const signOut = useSignOut();
  const [sidebarsOpen, setSidebarsOpen] = useStoredSidebarState();

  // Which editor the tabs should show as current. Derived from the matched
  // route rather than the pathname, so the Canvas editor's nested `$artId`
  // match still reads as "Scenes".
  const activeEditor = useRouterState({
    select: ({ matches }): EditorKind =>
      matches.some(({ routeId }) => routeId.startsWith("/_authenticated/shows/$showId/art"))
        ? "canvas"
        : "show",
  });

  // Returning to Scenes should land back on the Artboard you left, not on
  // whichever one the bare /art route happens to redirect to. Session-scoped:
  // it is a convenience, not something worth persisting.
  const lastArtId = useRouterState({
    select: ({ matches }) =>
      matches.find(({ routeId }) => routeId === "/_authenticated/shows/$showId/art/$artId")
        ?.params as { artId?: string } | undefined,
  })?.artId;
  const [rememberedArtId, setRememberedArtId] = useState<string | null>(null);
  useEffect(() => {
    if (lastArtId) setRememberedArtId(lastArtId);
  }, [lastArtId]);

  if (showId !== null && show.isPending) {
    return <p className="p-6 text-muted-foreground">Loading…</p>;
  }

  if (showId === null || show.isError || !show.data) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
        <p role="alert">This Show doesn't exist, or isn't yours.</p>
        <Link to="/">Back to Shows</Link>
      </main>
    );
  }

  const currentShow = show.data;
  const state =
    draft.data && published.data
      ? publishState(draft.data.updatedAt, published.data.updatedAt)
      : "empty";

  const canvasPath = rememberedArtId
    ? `/shows/${params.showId}/art/${rememberedArtId}`
    : `/shows/${params.showId}/art`;

  return (
    <EditorLayout
      sidebarsOpen={sidebarsOpen}
      onSidebarsOpenChange={setSidebarsOpen}
      header={{
        name: currentShow.name,
        activeEditor,
        navigation: {
          home: { href: "/", onSelect: () => void navigate({ to: "/" }) },
          settings: { href: "/settings", onSelect: () => void navigate({ to: "/settings" }) },
          showEditor: {
            href: `/shows/${params.showId}`,
            onSelect: () =>
              void navigate({ to: "/shows/$showId", params: { showId: params.showId } }),
          },
          canvasEditor: {
            href: canvasPath,
            onSelect: () =>
              void (rememberedArtId
                ? navigate({
                    to: "/shows/$showId/art/$artId",
                    params: { showId: params.showId, artId: rememberedArtId },
                  })
                : navigate({ to: "/shows/$showId/art", params: { showId: params.showId } })),
          },
        },
        user: {
          name: me.data?.name,
          email: me.data?.email ?? "",
          avatarUrl: null,
        },
        onLogOut: () => signOut.mutate(),
        publishState: state,
        onPublish: () => publish.mutate(currentShow.id),
        publishing: publish.isPending,
        runActive: activeRun.data !== null && activeRun.data !== undefined,
        onStartRun: () => startRun.mutate(currentShow.id),
        onEndRun: () => endRun.mutate(currentShow.id),
        runPending: startRun.isPending || endRun.isPending,
        onRename: (name) => renameShow.mutate({ id: currentShow.id, name }),
        renaming: renameShow.isPending,
        renameError:
          renameShow.error instanceof GraphQLRequestError ? renameShow.error.message : undefined,
      }}
    >
      <Outlet />
    </EditorLayout>
  );
}
