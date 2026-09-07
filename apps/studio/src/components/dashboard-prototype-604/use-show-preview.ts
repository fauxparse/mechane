// PROTOTYPE — issue #604. Throwaway; see ./PrototypeSwitcher.tsx for the plan.
//
// The dashboard's preview data. `ListShowsQuery` carries id/name/timestamps and
// nothing else, so a card with a real picture on it needs the same three reads
// the Canvas editor does — the draft graph, the Artboards, the image assets —
// and the same `prepareCanvasPresentation` call, minus the command stack.
//
// One hook per Show means N x 3 requests for N Shows. That is the honest cost
// of previews against today's API, and the thing a real implementation would
// fix with a `Show.scenes` selection or a server-rendered thumbnail. For four
// seeded Shows it is fine, and it is what makes these variants judgeable.
import { defaultSourceValues } from "@mechane/domain";
import type { ShowId } from "@mechane/domain";
import { prepareCanvasPresentation } from "@mechane/rendering";
import type { CanvasPresentation } from "@mechane/rendering";
import { useMemo } from "react";

import { useCanvasWorkspace } from "../../api/canvas";
import { useImageAssets } from "../../api/images";
import { useShowGraph } from "../../api/show-graph";
import { canvasArtboardSize } from "../../editors/canvas/data/canvas-workspace";
import { toShowGraph } from "../../editors/show/data/api-graph";

/** One Scene of a Show, ready to paint at any size. */
export interface ScenePreview {
  readonly artId: string;
  readonly name: string;
  readonly presentation: CanvasPresentation;
  /** The authored Artboard size, which is what the thumbnail scales down from. */
  readonly width: number;
  readonly height: number;
}

/**
 * One Device of a Show, enough to link a physical screen at it. A Device with
 * no `pairingCode` has never been round-tripped to the server, so there is
 * nothing for a phone or projector to join with yet.
 */
export interface DevicePreview {
  readonly id: string;
  readonly name: string;
  readonly pairingCode: string | null;
  /** True for an Audience Device: one instance per connection. */
  readonly perConnection: boolean;
}

export interface ShowPreviewData {
  readonly scenes: readonly ScenePreview[];
  readonly devices: readonly DevicePreview[];
  /** The Scene a card should lead with: the biggest one, usually the projector. */
  readonly hero: ScenePreview | null;
  readonly counts: {
    readonly scenes: number;
    readonly devices: number;
    readonly sources: number;
    readonly flows: number;
    readonly blocks: number;
  };
  readonly pending: boolean;
}

const NO_COUNTS = { scenes: 0, devices: 0, sources: 0, flows: 0, blocks: 0 } as const;

export function useShowPreview(showId: ShowId): ShowPreviewData {
  const apiGraph = useShowGraph(showId, "draft");
  const workspace = useCanvasWorkspace(showId, "draft");
  const images = useImageAssets(showId);

  const pending = apiGraph.isPending || workspace.isPending;

  return useMemo(() => {
    if (!apiGraph.data || !workspace.data) {
      return { scenes: [], devices: [], hero: null, counts: NO_COUNTS, pending };
    }

    const graph = toShowGraph(apiGraph.data);
    // `assetId` is what a resolved image value is keyed by; the query calls it `id`.
    const imageAssets = (images.data ?? []).map((asset) => ({ ...asset, assetId: asset.id }));
    const sourceValues = defaultSourceValues(graph);
    const nodes = new Map(graph.nodes.map((node) => [node.id, node] as const));

    const scenes = workspace.data.flatMap<ScenePreview>((artboard) => {
      if (artboard.kind !== "scene") return [];
      const owner = nodes.get(artboard.artId);
      if (owner?.kind !== "scene") return [];
      const { width, height } = canvasArtboardSize(artboard);
      return [
        {
          artId: artboard.artId,
          name: owner.name.trim() || "Untitled Scene",
          width,
          height,
          presentation: prepareCanvasPresentation({
            canvas: artboard.canvas,
            graph,
            blocks: graph.blocks ?? [],
            imageAssets,
            owner: { kind: "scene", scene: owner, sourceValues },
            mode: "studio",
          }),
        },
      ];
    });

    const hero =
      scenes.reduce<ScenePreview | null>(
        (best, scene) =>
          !best || scene.width * scene.height > best.width * best.height ? scene : best,
        null,
      ) ?? null;

    const devices = graph.nodes.flatMap<DevicePreview>((node) =>
      node.kind === "device"
        ? [
            {
              id: node.id,
              name: node.name.trim() || "Untitled Device",
              pairingCode: node.pairingCode,
              perConnection: node.perConnection,
            },
          ]
        : [],
    );

    const counts = {
      scenes: graph.nodes.filter((node) => node.kind === "scene").length,
      devices: graph.nodes.filter((node) => node.kind === "device").length,
      sources: graph.nodes.filter((node) => node.kind === "source").length,
      flows: graph.nodes.filter((node) => node.kind === "flow").length,
      blocks: graph.blocks?.length ?? 0,
    };

    return { scenes, devices, hero, counts, pending };
  }, [apiGraph.data, images.data, pending, workspace.data]);
}
