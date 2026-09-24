import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSubmenu,
  ContextMenuSubmenuContent,
  ContextMenuSubmenuTrigger,
  ContextMenuTrigger,
  LayoutHorizontalIcon,
  Maximize2,
  Pencil,
  Plus,
  Trash2,
} from "@mechane/design-system";
import { DEFAULT_FLOW_COLOR, FLOW_COLORS, isFlowColor } from "@mechane/domain";
import type { FlowColor, GraphNode, Position } from "@mechane/domain";
import type { MutableRefObject } from "react";

import type { GraphConnectionEditing, GraphCreationEditing } from "./commands/use-graph-editing";
import type { CreationSite } from "./show-graph-layout";
import {
  ShowGraphCanvas,
  type ShowGraphCanvasProps,
  type ShowGraphFitViewOptions,
} from "./graph/ShowGraphCanvas";
import type { ShowGraphViewport } from "./graph/react-flow";
import type { CreatableNode } from "./graph/node-kinds";
import { CREATABLE_NODES } from "./graph/node-kinds";

export interface ShowGraphContextMenuProps {
  menuPosition: MutableRefObject<Position>;
  screenToFlowPosition(position: Position): Position;
  selectedNodes: GraphNode[];
  create(creatable: CreatableNode, site: CreationSite): unknown;
  fitView(options: ShowGraphFitViewOptions): void;
  fitViewOptions: ShowGraphFitViewOptions;
  initialViewport?: ShowGraphViewport;
  onViewportChange?(viewport: ShowGraphViewport): void;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  tidy(): void;
  requestDelete(): void;
  nodes: ShowGraphCanvasProps["nodes"];
  edges: ShowGraphCanvasProps["edges"];
  onNodesChange: ShowGraphCanvasProps["onNodesChange"];
  onEdgesChange: ShowGraphCanvasProps["onEdgesChange"];
  beginDrag: ShowGraphCanvasProps["beginDrag"];
  dragTo: ShowGraphCanvasProps["dragTo"];
  endDrag: ShowGraphCanvasProps["endDrag"];
  creation: GraphCreationEditing;
  connections: GraphConnectionEditing;
  setNodeColor(nodeId: string, color: FlowColor): void;
  onConnect: ShowGraphCanvasProps["onConnect"];
  createFromConnection: ShowGraphCanvasProps["createFromConnection"];
  isValidConnection: ShowGraphCanvasProps["isValidConnection"];
  jumpToMinimapPoint: ShowGraphCanvasProps["jumpToMinimapPoint"];
}

export function ShowGraphContextMenu({
  menuPosition,
  screenToFlowPosition,
  selectedNodes,
  create,
  fitView,
  fitViewOptions,
  initialViewport,
  onViewportChange,
  selectedNodeIds,
  selectedEdgeIds,
  requestDelete,
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  beginDrag,
  dragTo,
  endDrag,
  creation,
  connections,
  tidy,
  setNodeColor,
  createFromConnection,
  onConnect,
  isValidConnection,
  jumpToMinimapPoint,
}: ShowGraphContextMenuProps) {
  const editing = { ...creation, ...connections, setNodeColor };
  const selectedNode = selectedNodes.length === 1 ? (selectedNodes[0] ?? null) : null;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="h-full w-full"
        onContextMenu={(event) => {
          menuPosition.current = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        }}
      >
        <ShowGraphCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          beginDrag={beginDrag}
          dragTo={dragTo}
          endDrag={endDrag}
          beginConnect={editing.beginConnect}
          endConnect={editing.endConnect}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          createFromConnection={createFromConnection}
          initialViewport={initialViewport}
          onViewportChange={onViewportChange}
          fitViewOptions={fitViewOptions}
          jumpToMinimapPoint={jumpToMinimapPoint}
        />
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuLabel>Canvas</ContextMenuLabel>
        </ContextMenuGroup>
        <ContextMenuSubmenu>
          <ContextMenuSubmenuTrigger>
            <Plus /> Create
          </ContextMenuSubmenuTrigger>
          <ContextMenuSubmenuContent>
            {CREATABLE_NODES.map((creatable) => {
              const Icon = creatable.icon;
              return (
                <ContextMenuItem
                  key={creatable.id}
                  // Right-clicking inside a Flow creates in that Flow;
                  // right-clicking the canvas creates on the canvas (#508).
                  onClick={() => create(creatable, { from: "point", at: menuPosition.current })}
                >
                  <Icon /> {creatable.label}
                </ContextMenuItem>
              );
            })}
          </ContextMenuSubmenuContent>
        </ContextMenuSubmenu>
        {selectedNode ? (
          <ContextMenuSubmenu>
            <ContextMenuSubmenuTrigger>
              <Pencil /> Node color
            </ContextMenuSubmenuTrigger>
            <ContextMenuSubmenuContent>
              {FLOW_COLORS.map((color) => (
                <ContextMenuItem
                  key={color}
                  onClick={() => {
                    if (isFlowColor(color)) editing.setNodeColor(selectedNode.id, color);
                  }}
                >
                  <span
                    className="mr-2 inline-block size-2 rounded-full"
                    style={{
                      backgroundColor:
                        color === DEFAULT_FLOW_COLOR
                          ? "var(--palette-neutral-500)"
                          : `var(--palette-${color}-500)`,
                    }}
                  />
                  {color[0]?.toUpperCase()}
                  {color.slice(1)}
                </ContextMenuItem>
              ))}
            </ContextMenuSubmenuContent>
          </ContextMenuSubmenu>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={tidy}>
          <LayoutHorizontalIcon /> Tidy graph
        </ContextMenuItem>
        <ContextMenuItem onClick={() => fitView(fitViewOptions)}>
          <Maximize2 /> Fit whole Show
        </ContextMenuItem>
        <ContextMenuItem
          disabled={selectedNodeIds.length === 0 && selectedEdgeIds.length === 0}
          variant="destructive"
          onClick={requestDelete}
        >
          <Trash2 /> Delete selection
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
