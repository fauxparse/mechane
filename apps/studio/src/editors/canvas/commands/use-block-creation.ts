// "Make this a Block" (#426): the selection leaves the Canvas for a Block Canvas of its own, and
// a Slot holding an instance of that Block takes its place.
//
// One action, two command stacks — the Block is a Show-graph resource and the Slot is a Canvas
// edit — so it runs inside the undo coordinator's `link`, which is what makes one Cmd+Z reverse
// both halves. The derivation itself is in `@mechane/commands`; this is only the wiring.

import {
  blockExtractionProblem,
  blockNameForSelection,
  createBlockFromSelection,
} from "@mechane/commands";
import type { ShowGraph } from "@mechane/domain";
import { useCallback } from "react";

import type { CanvasArtboardDocument } from "../../../api/canvas";
import type { CanvasCommands } from "./use-canvas-commands";
import { freeArtboardPosition, uniqueBlockName } from "../data/canvas-workspace";
import type { UndoCoordinator } from "./undo-coordinator";

export interface BlockCreationInput {
  readonly artboards: readonly CanvasArtboardDocument[];
  readonly canvasCommands: CanvasCommands;
  readonly graph: ShowGraph;
  readonly executeGraphCommand: (
    command: ReturnType<typeof createBlockFromSelection>["graphCommand"],
  ) => void;
  readonly undoHistory: UndoCoordinator;
}

export function useBlockCreation({
  artboards,
  canvasCommands,
  graph,
  executeGraphCommand,
  undoHistory,
}: BlockCreationInput): (canvasId: string, elementIds: readonly string[]) => void {
  const execute = canvasCommands.execute;
  return useCallback(
    (canvasId: string, elementIds: readonly string[]) => {
      const artboard = artboards.find((candidate) => candidate.canvasId === canvasId);
      if (!artboard || blockExtractionProblem(artboard.canvas, elementIds)) return;
      const created = createBlockFromSelection({
        canvasId,
        canvas: artboard.canvas,
        elementIds,
        name: uniqueBlockName(
          (graph.blocks ?? []).map((block) => block.name),
          blockNameForSelection(artboard.canvas, elementIds),
        ),
        position: freeArtboardPosition(artboards),
      });
      undoHistory.link(() => {
        // The Block first: the Slot that replaces the selection references it.
        executeGraphCommand(created.graphCommand);
        execute(created.canvasCommand);
      });
    },
    [artboards, execute, executeGraphCommand, graph.blocks, undoHistory],
  );
}
