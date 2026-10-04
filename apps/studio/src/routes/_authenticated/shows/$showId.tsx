// The shared Show editor layout for "/shows/$showId" (issue #39).
//
// The `_graph` child owns the Show Editor, while art.tsx owns the Canvas
// editor. Keeping those editors in sibling routes lets TanStack Router select
// the correct surface instead of making the layout inspect pathname strings or
// render one editor beside the other.
//
// This route is the only place in the editor that touches hooks: it reads the
// Show, the graphs, the run, and the signed-in user, and hands EditorLayout
// plain data and callbacks. That is what lets the whole Chrome be reviewed in
// Storybook with no router and no query client.
import { isId, type ShowId } from "@mechane/domain/id";
import { hasUnpublishedChanges, publishState } from "@mechane/domain/publish";
import { GraphQLRequestError } from "@mechane/graphql-schema";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { usePublishShowGraph, useShowGraph } from "../../../api/show-graph";
import { useActiveRun, useEndRun, useGoLive } from "../../../api/runs";
import { useRenameShow, useShow } from "../../../api/shows";
import { useMe } from "../../../api/me";
import { useUserSettings } from "../../../api/settings";
import { useSignOut } from "../../../api/auth";
import { EditorLayout } from "../../../components/EditorLayout/EditorLayout";
import { useStoredSidebarState } from "../../../components/EditorLayout/use-stored-sidebar-state";
import type { EditorKind } from "../../../components/Header/Header";
import { LastWindowRunDialog } from "../../../components/LastWindowRun/LastWindowRunDialog";
import { useLastWindowRunPrompt } from "../../../components/LastWindowRun/use-last-window-run-prompt";
import { StartRunPromptDialog } from "../../../components/StartRunPrompt/StartRunPromptDialog";
import { useStartRunPrompt } from "../../../components/StartRunPrompt/use-start-run-prompt";
import { useShapeEditorStatus } from "../../../editors/show/shapes/shape-editor-status";

export const Route = createFileRoute("/_authenticated/shows/$showId")({
  component: ShowEditorLayout,
});

function ShowEditorLayout() {
  const params = Route.useParams();
  // The one place a Show id arrives from outside the system, so the one
  // place it gets validated (issue #47).
  const showId: ShowId | null = isId("show", params.showId) ? params.showId : null;
  const show = useShow(showId);
  const me = useMe();
  // Both graph states feed the publish badge. The index child owns the draft
  // snapshot used by the graph command stack.
  const draft = useShowGraph(showId, "draft");
  const published = useShowGraph(showId, "published");
  const activeRun = useActiveRun(showId);
  const renameShow = useRenameShow();
  const publish = usePublishShowGraph();
  const goLive = useGoLive();
  const endRun = useEndRun();
  const signOut = useSignOut();
  const [sidebarsOpen, setSidebarsOpen] = useStoredSidebarState();
  const shapeEditorStatus = useShapeEditorStatus();
  const { settings } = useUserSettings();
  const lastWindowRunPrompt = useLastWindowRunPrompt({
    showId,
    activeRunId: activeRun.data?.id ?? null,
    enabled: settings.askToEndRunOnClose ?? true,
  });
  const runActive = activeRun.data !== null && activeRun.data !== undefined;
  const startRunPrompt = useStartRunPrompt({ showId, runActive });

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

  const startRun = () =>
    goLive.mutate({ showId: currentShow.id, publishFirst: hasUnpublishedChanges(state) });
  // The header's Go live is disabled for the same reason.
  const goLiveDisabledReason = hasUnpublishedChanges(state)
    ? (shapeEditorStatus.invalidReason ?? undefined)
    : undefined;

  return (
    <EditorLayout
      sidebarsOpen={sidebarsOpen}
      onSidebarsOpenChange={setSidebarsOpen}
      header={{
        name: currentShow.name,
        activeEditor,
        showId,
        sceneArtId: rememberedArtId,
        user: {
          id: me.data?.id ?? "unknown",
          name: me.data?.name,
          email: me.data?.email ?? "",
          avatarUrl: null,
        },
        onLogOut: () => signOut.mutate(),
        autoPublish: currentShow.autoPublish,
        publishState: state,
        publishDisabledReason: shapeEditorStatus.invalidReason ?? undefined,
        onPublish: () => {
          if (
            shapeEditorStatus.activeRunWarning &&
            !window.confirm(
              "Publishing Shape changes during the active Run may coerce live values. Continue?",
            )
          )
            return;
          publish.mutate(currentShow.id);
        },
        publishing: publish.isPending || goLive.isPending,
        runActive,
        onStartRun: startRun,
        onEndRun: () => endRun.mutate(currentShow.id),
        runPending: goLive.isPending || endRun.isPending,
        onRename: (name) => renameShow.mutate({ id: currentShow.id, name }),
        renaming: renameShow.isPending,
        renameError:
          renameShow.error instanceof GraphQLRequestError ? renameShow.error.message : undefined,
      }}
    >
      <Outlet />
      <LastWindowRunDialog
        showName={currentShow.name}
        open={lastWindowRunPrompt.open}
        onEndRun={() => {
          lastWindowRunPrompt.dismiss();
          endRun.mutate(currentShow.id);
        }}
        onKeepRunning={lastWindowRunPrompt.dismiss}
      />
      <StartRunPromptDialog
        showName={currentShow.name}
        open={startRunPrompt.open}
        devices={startRunPrompt.devices}
        goLiveDisabledReason={goLiveDisabledReason}
        onGoLive={() => {
          startRunPrompt.accept();
          startRun();
        }}
        onNotNow={startRunPrompt.decline}
      />
    </EditorLayout>
  );
}
