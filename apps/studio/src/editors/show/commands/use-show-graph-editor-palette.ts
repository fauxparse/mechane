import { Maximize2, Pencil, Plus, Redo2, Trash2, Undo2 } from "@mechane/design-system";
import type { FitViewOptions } from "@xyflow/react";
import type { CreatableNode } from "../graph/node-kinds";
import { CREATABLE_NODES } from "../graph/node-kinds";
import type { GraphNode, Position } from "@mechane/domain";
import { useMemo } from "react";

import type { GraphCommands } from "./use-graph-commands";
import type { PaletteCommand } from "./palette-commands";
import { moveIntoFlowDisabledReason, moveOutOfFlowDisabledReason } from "../show-graph-guards";
import { FLOW_CONTENT_ORIGIN } from "../graph/graph-to-flow";
import type { ShowFlowNode } from "../graph/graph-to-flow";
import { moveOutPositions } from "../show-graph-layout";

export interface ShowGraphEditorPaletteOptions {
  commands: GraphCommands;
  selectedNodes: GraphNode[];
  selectedEdgeIds: string[];
  create(creatable: CreatableNode, at: Position): unknown;
  centreOfView(): Position;
  selectAll(): void;
  fitView(options: FitViewOptions): void;
  fitViewOptions: FitViewOptions;
  zoomToSelection(): void;
  renameSelected(): void;
  moveIntoFlow(nodeIds: string[], flowId: string, origin: Position): void;
  moveOutOfFlow(nodeIds: string[], positions: Position[]): string | null;
  addVariable(sceneId: string): void;
  say(text: string): void;
  requestDelete(): void;
  nodes: ShowFlowNode[];
}

export function useShowGraphEditorPalette({
  commands,
  selectedNodes,
  selectedEdgeIds,
  create,
  centreOfView,
  selectAll,
  fitView,
  fitViewOptions,
  zoomToSelection,
  renameSelected,
  moveIntoFlow,
  moveOutOfFlow,
  addVariable,
  say,
  requestDelete,
  nodes,
}: ShowGraphEditorPaletteOptions): PaletteCommand[] {
  const editing = useMemo(
    () => ({ moveIntoFlow, moveOutOfFlow, addVariable }),
    [addVariable, moveIntoFlow, moveOutOfFlow],
  );
  return useMemo<PaletteCommand[]>(() => {
    const single = selectedNodes.length === 1 ? (selectedNodes[0] as GraphNode) : null;
    const nothingSelected = selectedNodes.length === 0 && selectedEdgeIds.length === 0;
    return [
      {
        id: "undo",
        label: "Undo",
        scope: "global",
        icon: Undo2,
        shortcut: "⌘Z",
        disabledReason: commands.canUndo ? undefined : "nothing to undo",
        run: commands.undo,
      },
      {
        id: "redo",
        label: "Redo",
        scope: "global",
        icon: Redo2,
        shortcut: "⇧⌘Z",
        disabledReason: commands.canRedo ? undefined : "nothing to redo",
        run: commands.redo,
      },
      ...CREATABLE_NODES.map((creatable) => ({
        id: `create-${creatable.id}`,
        label: `Create ${creatable.label}`,
        scope: "canvas" as const,
        icon: creatable.icon,
        run: () => create(creatable, centreOfView()),
      })),
      {
        id: "select-all",
        label: "Select all",
        scope: "canvas" as const,
        shortcut: "⌘A",
        run: selectAll,
      },
      {
        id: "fit-graph",
        label: "Fit whole Show",
        scope: "canvas" as const,
        icon: Maximize2,
        shortcut: "⇧1",
        run: () => fitView(fitViewOptions),
      },
      {
        id: "zoom-to-selection",
        label: "Zoom to selection",
        scope: "canvas" as const,
        icon: Maximize2,
        shortcut: "⇧2",
        disabledReason: selectedNodes.length > 0 ? undefined : "select a node first",
        run: () => zoomToSelection(),
      },
      {
        id: "rename",
        label: "Rename node",
        scope: "selection" as const,
        icon: Pencil,
        shortcut: "F2",
        disabledReason: single ? undefined : "select one node first",
        run: renameSelected,
      },
      {
        id: "move-into-flow",
        label: "Move into selected Flow",
        scope: "selection" as const,
        disabledReason: moveIntoFlowDisabledReason(selectedNodes),
        run: () => {
          const flow = selectedNodes.find((node) => node.kind === "flow");
          const nodeIds = selectedNodes.reduce<string[]>((ids, node) => {
            if (node.kind !== "flow") ids.push(node.id);
            return ids;
          }, []);
          if (flow && nodeIds.length > 0)
            editing.moveIntoFlow(nodeIds, flow.id, FLOW_CONTENT_ORIGIN);
        },
      },
      {
        id: "move-out-of-flow",
        label: "Move out of Flow",
        scope: "selection" as const,
        disabledReason: moveOutOfFlowDisabledReason(selectedNodes),
        run: () => {
          const nodeIds = selectedNodes.map((node) => node.id);
          const positions = moveOutPositions(nodeIds, nodes);
          const reason = editing.moveOutOfFlow(nodeIds, positions);
          if (reason) say(reason);
        },
      },
      {
        id: "add-variable",
        label: "Add Variable to Scene",
        scope: "selection" as const,
        icon: Plus,
        disabledReason: single?.kind === "scene" ? undefined : "select one Scene first",
        run: () => single && editing.addVariable(single.id),
      },
      {
        id: "delete",
        label: "Delete selection",
        scope: "selection" as const,
        icon: Trash2,
        shortcut: "⌫",
        disabledReason: nothingSelected ? "select something first" : undefined,
        run: requestDelete,
      },
    ];
  }, [
    centreOfView,
    commands.canRedo,
    commands.canUndo,
    commands.redo,
    commands.undo,
    create,
    editing,
    fitView,
    fitViewOptions,
    renameSelected,
    requestDelete,
    say,
    selectAll,
    selectedEdgeIds.length,
    selectedNodes,
    nodes,
    zoomToSelection,
  ]);
}
