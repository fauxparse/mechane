import type { ImageInputOnUploadProps } from "@mechane/design-system";
import type { ShowId } from "@mechane/domain/id";
import type { ResolvedImageValue } from "@mechane/domain/shapes";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";

import { resolveApiUrl } from "../../../../api/client";
import { useImageAssets, useImageUpload } from "../../../../api/images";
import { useActiveRun, useReshuffleTransformer } from "../../../../api/runs";
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
import { useOpenedShowGraph } from "../../../../editors/show/data/use-opened-graph";
export interface ShowGraphRouteProps {
  initialSourceValue?: ShowGraphValueLocation;
  onSourceValueChange?: (location: ShowGraphValueLocation | null) => void;
}

export function ShowGraphIndexRoute() {
  const params = useParams({ from: "/_authenticated/shows/$showId/" });
  return <ShowGraphRoute showId={params.showId as ShowId} />;
}

export function ShowGraphRoute({
  showId,
  initialSourceValue,
  onSourceValueChange,
}: ShowGraphRouteProps & { showId: ShowId }) {
  const navigate = useNavigate();
  const draft = useShowGraph(showId, "draft");
  const imageAssets = useImageAssets(showId);
  const imageUpload = useImageUpload(showId);
  const activeRun = useActiveRun(showId);
  const reshuffleTransformer = useReshuffleTransformer();
  const resolvedImageAssets = useMemo(
    () => (imageAssets.data ?? []).map((asset) => ({ ...asset, assetId: asset.id })),
    [imageAssets.data],
  );
  const handleImageUpload = useCallback(
    ({ file, signal, onProgress, onSuccess, onError }: ImageInputOnUploadProps) => {
      void imageUpload
        .mutateAsync({ file, signal, onProgress })
        .then((asset) => {
          const resolvedValue: ResolvedImageValue & { revision: string } = {
            assetId: asset.id,
            revision: asset.revision,
            url: resolveApiUrl(asset.url),
            width: asset.width,
            height: asset.height,
            name: asset.name,
            alt: asset.alt,
            mimeType: asset.mimeType,
            blurHash: asset.blurHash,
          };
          onSuccess(resolvedValue);
        })
        .catch((error: unknown) => {
          if (signal.aborted) return;
          onError({
            code: "NETWORK_FAILURE",
            message: error instanceof Error ? error.message : "The image upload failed.",
            cause: error,
          });
        });
    },
    [imageUpload],
  );
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
  // The graph the editor opens with, decoded once at the seam where the
  // transport stops (#750).
  const openedWith = useOpenedShowGraph(draft.data);
  const [edited, setEdited] = useState(false);

  return (
    <>
      <ShowGraphEditor
        ref={editor}
        graph={openedWith}
        imageAssets={resolvedImageAssets}
        onImageUpload={handleImageUpload}
        onEdit={(edits) => {
          setEdited(true);
          saveGraph.enqueue(edits);
        }}
        initialViewport={initialViewport}
        onViewportChange={onViewportChange}
        initialSourceValue={initialSourceValue}
        onSourceValueChange={openSourceValue}
        runActive={activeRun.data !== null && activeRun.data !== undefined}
        reshufflingTransformerId={
          reshuffleTransformer.isPending
            ? (reshuffleTransformer.variables?.transformerId ?? null)
            : null
        }
        onReshuffleTransformer={(transformerId, deviceId) =>
          reshuffleTransformer.mutate({ showId, transformerId, deviceId })
        }
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
