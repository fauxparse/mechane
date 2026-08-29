// What the Canvas editor draws: the persisted Artboards, with the command stack's edits laid
// over them and every Property resolved for painting.
//
// It lives here rather than in the route because the route's job is wiring, and because one part
// of it is genuinely subtle: a Block created in this session (#426) has an Artboard the workspace
// query has never seen. The command stack made it, and the server will make its own from the
// same `graph.addBlock` edit, so until the next read the stack's copy *is* the Artboard.

import { defaultSourceValues, resolveCanvasProperties, sceneVariableValues } from "@mechane/domain";
import type { Block, ShowGraph } from "@mechane/domain";
import type { CanvasWorkspace } from "@mechane/commands";
import { useMemo } from "react";

import type { ImageAsset } from "@mechane/graphql-schema";
import type { CanvasArtboardDocument } from "../../../api/canvas";

export interface CanvasArtboardsInput {
  /** The persisted Artboards, as last read from the server. */
  readonly documents: readonly CanvasArtboardDocument[] | undefined;
  /** The Artboards as edited, from the Canvas command stack. */
  readonly workspace: CanvasWorkspace;
  readonly graph: ShowGraph;
  readonly imageAssets: readonly ImageAsset[];
}

export interface CanvasArtboards {
  readonly artboards: readonly CanvasArtboardDocument[];
  /** The Blocks the editor can place, one per Block Artboard. */
  readonly blocks: readonly Block[];
}

/** Artboards the command stack holds that the server has not sent back yet. */
function createdArtboards(
  documents: readonly CanvasArtboardDocument[],
  workspace: CanvasWorkspace,
  graph: ShowGraph,
): CanvasArtboardDocument[] {
  const known = new Set(documents.map((artboard) => artboard.canvasId));
  const blocksByCanvasId = new Map(
    (graph.blocks ?? []).map((block) => [block.canvas.id, block] as const),
  );
  return workspace.artboards.flatMap((artboard) => {
    if (known.has(artboard.canvasId)) return [];
    const block = blocksByCanvasId.get(artboard.canvasId);
    if (!block) return [];
    return [
      {
        canvasId: artboard.canvasId,
        artId: block.id,
        kind: "block" as const,
        name: block.name,
        canvas: artboard.canvas,
        position: artboard.position,
      },
    ];
  });
}

export function blocksForArtboards(
  artboards: readonly CanvasArtboardDocument[],
  graph: ShowGraph,
): readonly Block[] {
  return artboards.flatMap((artboard) => {
    if (artboard.kind !== "block") return [];
    const block = graph.blocks?.find((candidate) => candidate.id === artboard.artId);
    return [
      {
        id: artboard.artId,
        name: artboard.name,
        canvas: { ...artboard.canvas, id: artboard.canvasId },
        variables: block?.variables ?? [],
        states: block?.states ?? [],
        stateSelectorVariableId: block?.stateSelectorVariableId ?? null,
      },
    ];
  });
}
export function useCanvasArtboards({
  documents,
  workspace,
  graph,
  imageAssets,
}: CanvasArtboardsInput): CanvasArtboards {
  const all = useMemo<readonly CanvasArtboardDocument[]>(() => {
    const persisted = documents ?? [];
    const created = createdArtboards(persisted, workspace, graph);
    return created.length === 0 ? persisted : [...persisted, ...created];
  }, [documents, graph, workspace]);

  const artboards = useMemo(() => {
    const edits = new Map(
      workspace.artboards.map((artboard) => [artboard.canvasId, artboard] as const),
    );
    const nodes = new Map(graph.nodes.map((node) => [node.id, node] as const));
    const sourceValues = defaultSourceValues(graph);
    const assets = imageAssets.map((asset) => ({ ...asset, assetId: asset.id }));
    return all.map((artboard) => {
      const edited = edits.get(artboard.canvasId);
      const canvas = edited?.canvas ?? artboard.canvas;
      const owner = nodes.get(artboard.artId);
      const block = graph.blocks?.find((candidate) => candidate.id === artboard.artId);
      const variables =
        owner?.kind === "scene"
          ? owner.variables
          : (block?.variables.map(({ id, name, type, defaultValue }) => ({
              id,
              name,
              type,
              defaultValue,
            })) ?? []);
      const values =
        owner?.kind === "scene"
          ? sceneVariableValues(graph, owner.id, sourceValues)
          : block
            ? Object.fromEntries(
                block.variables.map((variable) => [variable.id, variable.defaultValue]),
              )
            : undefined;
      const renderVariables = variables.flatMap((variable) =>
        variable.type
          ? [{ id: variable.id, type: variable.type, value: values?.[variable.id] }]
          : [],
      );
      return {
        ...artboard,
        name: owner?.name ?? artboard.name,
        canvas,
        renderCanvas: resolveCanvasProperties(canvas, {
          graph,
          variables,
          values,
          shapes: graph.shapes,
          imageAssets: assets,
        }),
        renderVariables,
        renderImageAssets: assets,
        position: edited?.position ?? artboard.position,
      };
    });
  }, [all, graph, imageAssets, workspace.artboards]);

  const blocks = useMemo(() => blocksForArtboards(artboards, graph), [artboards, graph]);

  return { artboards, blocks };
}
