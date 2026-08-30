import { addBlock, addCanvasArtboard, addCanvasElement, composite } from "@mechane/commands";
import type { CanvasWorkspaceCommand, NewElement, ShowGraphCommand } from "@mechane/commands";
import { emptyBlock, generateId } from "@mechane/domain";
import type { Block, ShowGraph } from "@mechane/domain";

import type { CanvasBlockCreationRequest } from "../canvas-workspace-types";
import { uniqueBlockName } from "../data/canvas-workspace";

export interface CreatedBlockFromDrag {
  readonly block: Block;
  readonly graphCommand: ShowGraphCommand;
  readonly canvasCommand: CanvasWorkspaceCommand;
}

export function createBlockFromDrag(
  graph: ShowGraph,
  request: CanvasBlockCreationRequest,
): CreatedBlockFromDrag {
  const block = emptyBlock(
    uniqueBlockName(
      (graph.blocks ?? []).map((candidate) => candidate.name),
      "Block",
    ),
  );
  const width = Math.max(1, request.width);
  const height = Math.max(1, request.height);
  const root = {
    ...block.canvas.root,
    layoutMode: "absolute" as const,
    sizing: {
      width: { mode: "fixed" as const, value: width },
      height: { mode: "fixed" as const, value: height },
    },
  };
  const createdBlock = {
    ...block,
    canvas: {
      ...block.canvas,
      position: { ...request.position },
      root,
    },
  };
  const commands = [
    addCanvasArtboard({
      canvasId: createdBlock.canvas.id,
      canvas: { kind: "block", root },
      position: { ...request.position },
    }),
  ];
  if (request.sourceCanvasId && request.slotParentId && request.slotRank) {
    const slot: NewElement = {
      id: generateId("canvas"),
      type: "slot",
      blockId: createdBlock.id,
      layoutMode: "auto",
      sizing: {
        width: { mode: "fixed", value: width },
        height: { mode: "fixed", value: height },
      },
      ...request.slotProperties,
    };
    commands.push(
      addCanvasElement(request.sourceCanvasId, slot, request.slotParentId, request.slotRank),
    );
  }
  return {
    block: createdBlock,
    graphCommand: addBlock(createdBlock, "Create Block"),
    canvasCommand: composite({
      type: "canvas.createBlockFromDrag",
      label: "Create Block",
      scope: "selection",
      commands,
    }),
  };
}
