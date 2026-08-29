import type {
  Canvas,
  Element,
  ImageAssetReference,
  ResolvedCanvas,
  ResolvedImageValue,
  ShowId,
  SlotVariableValue,
} from "@mechane/domain";
import { GetShowCanvasesQuery, graphqlRequest } from "@mechane/graphql-schema";
import type { ShowCanvas } from "@mechane/graphql-schema";
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

type ApiElement = {
  __typename: string;
  children?: readonly ApiElement[];
  [key: string]: unknown;
};

function elementType(typename: string): Element["type"] {
  const type = typename.replace(/Element$/, "").toLowerCase();
  if (
    type === "rect" ||
    type === "ellipse" ||
    type === "text" ||
    type === "image" ||
    type === "frame" ||
    type === "slot"
  )
    return type;
  throw new Error(`Unknown Canvas Element type "${typename}".`);
}

function toElement(input: ApiElement): Element {
  const { __typename, children, ...fields } = input;
  const properties = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== null),
  );
  return {
    ...properties,
    type: elementType(__typename),
    children: children?.map(toElement) ?? [],
  } as unknown as Element;
}

export function toCanvasArtboard(canvas: ShowCanvas): CanvasArtboardDocument {
  return {
    canvasId: canvas.id,
    artId: canvas.ownerId,
    kind: canvas.kind === "scene" ? "scene" : "block",
    name: canvas.ownerName,
    canvas: {
      kind: canvas.kind === "scene" ? "scene" : "block",
      root: toElement(canvas.root as unknown as ApiElement) as Extract<Element, { type: "frame" }>,
    },
    position: { ...canvas.position },
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
