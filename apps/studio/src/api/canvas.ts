import type { Canvas, Element } from "@mechane/domain";
import type { ShowId } from "@mechane/domain";
import { GetSceneCanvasQuery, graphqlRequest } from "@mechane/graphql-schema";
import type { SceneCanvas } from "@mechane/graphql-schema";
import { useQuery } from "@tanstack/react-query";

import { GRAPHQL_ENDPOINT } from "./client";

export type SceneCanvasDocument = Canvas & { id: string; kind: "scene" };

type ApiElement = {
  __typename: string;
  children?: readonly ApiElement[];
  [key: string]: unknown;
};

function elementType(typename: string): Element["type"] {
  const type = typename.replace(/Element$/, "").toLowerCase();
  if (type === "rect" || type === "text" || type === "image" || type === "frame") return type;
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

export function toSceneCanvas(canvas: SceneCanvas): SceneCanvasDocument {
  return {
    id: canvas.id,
    kind: "scene",
    root: toElement(canvas.root as unknown as ApiElement) as Extract<Element, { type: "frame" }>,
  };
}

export const sceneCanvasQueryKey = (showId: ShowId, sceneNodeId: string, state: string) =>
  ["shows", showId, "scene-canvas", sceneNodeId, state] as const;

export function useSceneCanvas(
  showId: ShowId | null,
  sceneNodeId: string | null,
  state: "draft" | "published" = "draft",
) {
  return useQuery({
    queryKey: sceneCanvasQueryKey(showId ?? ("" as ShowId), sceneNodeId ?? "", state),
    enabled: showId !== null && sceneNodeId !== null,
    queryFn: async () => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, GetSceneCanvasQuery, {
        showId: showId as ShowId,
        sceneNodeId: sceneNodeId as string,
        state,
      });
      return toSceneCanvas(data.sceneCanvas);
    },
  });
}
