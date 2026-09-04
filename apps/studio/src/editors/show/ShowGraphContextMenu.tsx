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
  Maximize2,
  Pencil,
  Plus,
  Trash2,
} from "@mechane/design-system";
import { DEFAULT_FLOW_COLOR, FLOW_COLORS, isFlowColor } from "@mechane/domain";
import type { FlowColor, GraphNode, Position } from "@mechane/domain";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  PanOnScrollMode,
  ReactFlow,
  SelectionMode,
} from "@xyflow/react";
import type {
  Connection,
  FitViewOptions,
  OnEdgesChange,
  OnNodeDrag,
  OnNodesChange,
  XYPosition,
} from "@xyflow/react";
import type { MutableRefObject } from "react";

import type { GraphConnectionEditing, GraphCreationEditing } from "./commands/use-graph-editing";
import type { CreationSite } from "./show-graph-layout";
import { FLOW_NODE_TYPE, PLACEHOLDER_NODE_TYPE } from "./graph/graph-to-flow";
import type { ShowFlowEdge, ShowFlowNode } from "./graph/graph-to-flow";
import { ShowEdgeRoutingProvider } from "./graph/ShowEdgeRoutingProvider";
import { showEdgeTypes } from "./graph/show-edge-types";
import type { CreatableNode } from "./graph/node-kinds";
import { CREATABLE_NODES } from "./graph/node-kinds";
import { FlowNode } from "./graph/nodes/FlowNode";
import { ReactFlowBaseNode } from "./graph/nodes/ReactFlowBaseNode";
import { MIN_ZOOM, MAX_ZOOM } from "./show-graph-editor-constants";

const nodeTypes = {
  [PLACEHOLDER_NODE_TYPE]: ReactFlowBaseNode,
  [FLOW_NODE_TYPE]: FlowNode,
};

export interface ShowGraphContextMenuProps {
  menuPosition: MutableRefObject<Position>;
  screenToFlowPosition(position: XYPosition): XYPosition;
  selectedNodes: GraphNode[];
  create(creatable: CreatableNode, site: CreationSite): unknown;
  fitView(options: FitViewOptions): void;
  fitViewOptions: FitViewOptions;
  initialViewport?: { x: number; y: number; zoom: number };
  onViewportChange?(viewport: { x: number; y: number; zoom: number }): void;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  requestDelete(): void;
  nodes: ShowFlowNode[];
  edges: ShowFlowEdge[];
  onNodesChange: OnNodesChange<ShowFlowNode>;
  onEdgesChange: OnEdgesChange<ShowFlowEdge>;
  beginDrag: OnNodeDrag<ShowFlowNode>;
  dragTo(moved: ShowFlowNode[]): void;
  endDrag: OnNodeDrag<ShowFlowNode>;
  creation: GraphCreationEditing;
  connections: GraphConnectionEditing;
  setNodeColor(nodeId: string, color: FlowColor): void;
  onConnect(connection: Connection): void;
  createFromConnection(sourceId: string, sourceHandle: string, position: Position): void;
  isValidConnection(connection: Connection | ShowFlowEdge): boolean;
  jumpToMinimapPoint(event: React.MouseEvent, position: XYPosition): void;
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
        <ShowEdgeRoutingProvider nodes={nodes}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={showEdgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={beginDrag}
            onNodeDrag={(_event, _node, moved) => dragTo(moved)}
            onNodeDragStop={endDrag}
            onConnectStart={(_event, { nodeId, handleId }) => {
              if (nodeId) editing.beginConnect(nodeId, handleId);
            }}
            onConnectEnd={(event, connectionState) => {
              editing.endConnect();
              if (
                connectionState.toNode ||
                !connectionState.fromNode ||
                !connectionState.fromHandle
              ) {
                return;
              }
              const point = "changedTouches" in event ? event.changedTouches[0] : event;
              if (!point) return;
              createFromConnection(
                connectionState.fromNode.id,
                connectionState.fromHandle.id ?? "",
                screenToFlowPosition({ x: point.clientX, y: point.clientY }),
              );
            }}
            onConnect={onConnect}
            isValidConnection={(connection) => isValidConnection(connection as Connection)}
            deleteKeyCode={null}
            selectionMode={SelectionMode.Full}
            selectionKeyCode={null}
            selectionOnDrag
            panActivationKeyCode="Space"
            panOnDrag={false}
            panOnScroll
            panOnScrollMode={PanOnScrollMode.Free}
            zoomOnScroll
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            defaultViewport={initialViewport}
            onViewportChange={onViewportChange}
            fitView={false}
            fitViewOptions={fitViewOptions}
            proOptions={{ hideAttribution: true }}
            aria-label="Show graph"
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
            <Controls fitViewOptions={fitViewOptions} />
            <MiniMap
              pannable
              zoomable
              onClick={jumpToMinimapPoint}
              ariaLabel="Show graph minimap"
            />
          </ReactFlow>
        </ShowEdgeRoutingProvider>
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
