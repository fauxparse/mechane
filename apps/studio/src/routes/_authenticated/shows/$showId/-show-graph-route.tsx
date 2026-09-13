import type { ShowId } from "@mechane/domain";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { useShowGraph, useShowGraphEdits } from "../../../../api/show-graph";
import {
  ShowGraphEditor,
  type ShowGraphEditorHandle,
  type ShowGraphValueLocation,
} from "../../../../editors/show/ShowGraphEditor";
import {
  rememberedShowViewport,
  rememberShowViewport,
} from "../../../../editors/show/data/show-session";

export interface ShowGraphRouteProps {
  initialSourceValue?: ShowGraphValueLocation;
  onSourceValueChange?: (location: ShowGraphValueLocation | null) => void;
}

export function ShowGraphRoute({
  showId,
  initialSourceValue,
  onSourceValueChange,
}: ShowGraphRouteProps & { showId: ShowId }) {
  const navigate = useNavigate();
  const draft = useShowGraph(showId, "draft");
  const editor = useRef<ShowGraphEditorHandle>(null);
  const initialViewport = rememberedShowViewport(showId);
  const onViewportChange = useCallback(
    (viewport: Parameters<typeof rememberShowViewport>[1]) => {
      rememberShowViewport(showId, viewport);
    },
    [showId],
  );
  const openSourceValue = useCallback(
    (location: ShowGraphValueLocation | null) => {
      if (onSourceValueChange) {
        onSourceValueChange(location);
        return;
      }
      if (!location) {
        void navigate({ to: "/shows/$showId", params: { showId } });
        return;
      }
      void navigate({
        to: "/shows/$showId/source/$sourceId/$fieldId",
        params: {
          showId,
          sourceId: location.nodeId,
          fieldId: location.fieldPath[0] ?? "root",
        },
      });
    },
    [navigate, onSourceValueChange, showId],
  );
  const saveGraph = useShowGraphEdits(showId, draft.data?.version, {
    onAmend: (edits) => editor.current?.applyAmendments(edits),
  });

  // The graph the editor opens with is captured once. The editor owns that
  // snapshot after opening so a cache refresh cannot reset its command stack.
  const [openedWith, setOpenedWith] = useState<typeof draft.data | null>(null);
  useEffect(() => {
    if (draft.data && !openedWith) setOpenedWith(draft.data);
  }, [draft.data, openedWith]);
  const [edited, setEdited] = useState(false);

  return (
    <>
      <ShowGraphEditor
        ref={editor}
        graph={openedWith}
        onEdit={(edits) => {
          setEdited(true);
          saveGraph.enqueue(edits);
        }}
        initialViewport={initialViewport}
        onViewportChange={onViewportChange}
        initialSourceValue={initialSourceValue}
        onSourceValueChange={openSourceValue}
      />
      {saveGraph.error ? (
        <p
          role="alert"
          className="absolute inset-x-0 bottom-0 bg-destructive px-4 py-2 text-center text-sm text-destructive-foreground"
        >
          Your changes couldn't be saved: {saveGraph.error.message} Reload to pick up the stored
          draft.
        </p>
      ) : null}
      {openedWith && openedWith.nodes.length === 0 && !edited ? (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Nothing here yet. Right-click the canvas, or press ⌘K, to create something.
        </p>
      ) : null}
    </>
  );
}
