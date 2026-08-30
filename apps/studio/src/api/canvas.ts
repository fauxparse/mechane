import type {
  Canvas,
  ImageAssetReference,
  ResolvedCanvas,
  ResolvedImageValue,
  ShowId,
  SlotVariableValue,
} from "@mechane/domain";
import {
  decodeCanvasDocument,
  GetShowCanvasesQuery,
  graphqlRequest,
} from "@mechane/graphql-schema";
import type { ArtboardDocument } from "@mechane/graphql-schema";
import { useQuery } from "@tanstack/react-query";

import { GRAPHQL_ENDPOINT } from "./client";

export interface CanvasArtboardDocument {
  readonly canvasId: string;
  readonly artId: string;
  readonly kind: "scene" | "block";
  readonly name: string;
  /** Persisted values, including PropertyConnection objects, used by the Inspector. */
  readonly canvas: Canvas;
  /** Typed values used by Slot expansion while painting this Artboard. */
  readonly renderVariables?: readonly SlotVariableValue[];
  /** Resolved assets used by nested Block image Elements. */
  readonly renderImageAssets?: readonly (ResolvedImageValue &
    Pick<ImageAssetReference, "revision">)[];
  /** Materialised values used only for painting the Canvas. */
  readonly renderCanvas?: ResolvedCanvas;
  readonly position: { x: number; y: number };
}

/**
 * One Artboard document as the Canvas editor's artboard.
 *
 * The Canvas itself is `decodeCanvasDocument`'s to reconstruct (#436); what
 * this adapter adds is the framing and owner facts the Canvas editor needs and
 * the Player does not.
 */
export function toCanvasArtboard(artboard: ArtboardDocument): CanvasArtboardDocument {
  const canvas = decodeCanvasDocument(artboard.canvas);
  return {
    canvasId: String(artboard.canvas.id),
    artId: artboard.ownerId,
    kind: canvas.kind === "block" ? "block" : "scene",
    name: artboard.ownerName,
    canvas,
    position: { ...artboard.position },
  };
}

export const canvasWorkspaceQueryKey = (showId: ShowId, state: "draft" | "published") =>
  ["shows", showId, "canvas-workspace", state] as const;

export function useCanvasWorkspace(showId: ShowId | null, state: "draft" | "published" = "draft") {
  return useQuery({
    queryKey: canvasWorkspaceQueryKey(showId ?? ("" as ShowId), state),
    enabled: showId !== null,
    queryFn: async () => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, GetShowCanvasesQuery, {
        showId: showId as ShowId,
        state,
      });
      return data.showCanvases.map(toCanvasArtboard);
    },
  });
}
