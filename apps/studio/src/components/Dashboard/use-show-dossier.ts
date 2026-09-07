// Everything the dashboard shows about one Show beyond its name (issue #604).
//
// `ListShowsQuery` carries id, name and timestamps, so a card with a real
// picture on it needs the same three reads the Canvas editor makes — the draft
// graph, the Artboards, the image assets — and the same
// `prepareCanvasPresentation` call, minus the command stack.
//
// KNOWN COST: three requests per Show, and `useActiveRuns` adds a fourth. That
// is what previews cost against today's API, where `Show` has no relations and
// no thumbnail. It is fine for a handful of Shows and wrong for fifty, and the
// fix belongs on the server: a `Show.scenes` selection, or a rendered
// thumbnail, so the list query answers this in one round trip. Everything that
// would have to change lives in this file, so that fix is a drop-in.
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
  /** The authored Artboard size, which is what a thumbnail scales down from. */
  readonly width: number;
  readonly height: number;
}

/**
 * One Device of a Show, enough to point a physical screen at it. A Device with
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

export interface ShowCounts {
  readonly scenes: number;
  readonly devices: number;
  readonly sources: number;
}

export interface ShowDossier {
  readonly scenes: readonly ScenePreview[];
  readonly devices: readonly DevicePreview[];
  /** The Scene to lead with: the biggest one, which is usually the projector. */
  readonly hero: ScenePreview | null;
  readonly counts: ShowCounts;
  readonly pending: boolean;
}

const NO_COUNTS: ShowCounts = { scenes: 0, devices: 0, sources: 0 };

export function useShowDossier(showId: ShowId): ShowDossier {
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

    const hero = scenes.reduce<ScenePreview | null>(
      (best, scene) =>
        !best || scene.width * scene.height > best.width * best.height ? scene : best,
      null,
    );

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

    return {
      scenes,
      devices,
      hero,
      counts: {
        scenes: graph.nodes.filter((node) => node.kind === "scene").length,
        devices: devices.length,
        sources: graph.nodes.filter((node) => node.kind === "source").length,
      },
      pending,
    };
  }, [apiGraph.data, images.data, pending, workspace.data]);
}
