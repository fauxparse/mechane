import type { ShowId } from "@mechane/domain";
import { isId } from "@mechane/domain";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";

import { useActiveRun } from "../../../../api/runs";
import { useShowGraph, useShowGraphEdits } from "../../../../api/show-graph";
import { useGraphEditing } from "../../../../editors/show/commands/use-graph-editing";
import { ShapeWorkspace } from "../../../../editors/show/shapes/ShapeWorkspace";

export const Route = createFileRoute("/_authenticated/shows/$showId/shapes")({
  component: ShapesRoute,
});

function ShapesRoute() {
  const params = Route.useParams();
  const showId: ShowId | null = isId("show", params.showId) ? params.showId : null;
  const activeRun = useActiveRun(showId);
  const navigate = useNavigate();
  const shapeId = useRouterState({
    select: ({ matches }) =>
      (
        matches.find(({ routeId }) => routeId === "/_authenticated/shows/$showId/shapes/$shapeId")
          ?.params as { shapeId?: string } | undefined
      )?.shapeId ?? null,
  });
  const draft = useShowGraph(showId, "draft");
  const save = useShowGraphEdits(showId, draft.data?.version);
  const editing = useGraphEditing(draft.data, (edits) => save.enqueue(edits));

  if (showId === null || draft.isError) {
    return (
      <ShapeRouteState
        message={
          draft.error instanceof Error ? draft.error.message : "This Show could not be loaded."
        }
        actionLabel="Retry"
        onAction={() => void draft.refetch()}
      />
    );
  }
  if (draft.isPending || !draft.data) return <ShapeRouteState message="Loading Shapes…" />;

  return (
    <ShapeWorkspace
      graph={editing.graph}
      shapeId={shapeId}
      editing={editing}
      saving={save.saving}
      saveError={save.error}
      retrySave={save.retry}
      runActive={activeRun.data !== null && activeRun.data !== undefined}
      onOpenShape={(nextShapeId) =>
        void navigate({
          to: "/shows/$showId/shapes/$shapeId",
          params: { showId: params.showId, shapeId: nextShapeId },
        })
      }
      onBack={() =>
        void navigate({ to: "/shows/$showId/shapes", params: { showId: params.showId } })
      }
    />
  );
}

function ShapeRouteState({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?(): void;
}) {
  return (
    <main className="flex min-h-full items-center justify-center bg-background px-6 pt-20">
      <div className="max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">{message}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </main>
  );
}
