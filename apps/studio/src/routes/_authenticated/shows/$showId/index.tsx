// The default Show editor surface. The sibling art route owns the Canvas
// workspace; this index route owns the graph command stack.
import type { ShowId } from "@mechane/domain";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { useShowGraph, useShowGraphEdits } from "../../../../api/show-graph";
import { ShowGraphEditor } from "../../../../editors/show/ShowGraphEditor";
import type { ShowGraphEditorHandle } from "../../../../editors/show/ShowGraphEditor";

export const Route = createFileRoute("/_authenticated/shows/$showId/")({
  component: ShowGraphIndexRoute,
});

function ShowGraphIndexRoute() {
  const params = Route.useParams();
  const showId = params.showId as ShowId;
  const draft = useShowGraph(showId, "draft");
  const editor = useRef<ShowGraphEditorHandle>(null);
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
