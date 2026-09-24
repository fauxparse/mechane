import { isId, type ShowId } from "@mechane/domain/id";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ShowGraphRoute } from "../../-show-graph-route";

export const Route = createFileRoute("/_authenticated/shows/$showId/source/$sourceId/$fieldId")({
  component: SourceValueRoute,
});

function SourceValueRoute() {
  const params = Route.useParams();
  const navigate = useNavigate();
  const showId: ShowId | null = isId("show", params.showId) ? params.showId : null;
  if (showId === null) return null;
  const initialSourceValue = {
    nodeId: params.sourceId,
    fieldPath: params.fieldId === "root" ? [] : [params.fieldId],
  };
  return (
    <ShowGraphRoute
      showId={showId}
      initialSourceValue={initialSourceValue}
      onSourceValueChange={(location) => {
        if (!location) {
          void navigate({ to: "/shows/$showId", params: { showId: params.showId } });
          return;
        }
        void navigate({
          to: "/shows/$showId/source/$sourceId/$fieldId",
          params: {
            showId: params.showId,
            sourceId: location.nodeId,
            fieldId: location.fieldPath[0] ?? "root",
          },
        });
      }}
    />
  );
}
