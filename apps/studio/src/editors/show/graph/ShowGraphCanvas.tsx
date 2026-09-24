import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  PanOnScrollMode,
  ReactFlow,
  SelectionMode,
  useReactFlow,
} from "./react-flow";
import type {
  Connection,
  FitViewOptions,
  OnEdgesChange,
  OnNodeDrag,
  OnNodesChange,
  ShowGraphViewport,
} from "./react-flow";
import type { MouseEvent } from "react";

import type { Position } from "@mechane/domain";
import { FLOW_NODE_TYPE, NODE_TYPE_BY_KIND } from "./graph-to-flow";
import type { ShowFlowEdge, ShowFlowNode } from "./graph-to-flow";
import { ShowEdgeRoutingProvider } from "./ShowEdgeRoutingProvider";
import { showEdgeTypes } from "./show-edge-types";
import { DeviceNode } from "./nodes/DeviceNode";
import { FlowNode } from "./nodes/FlowNode";
import { SceneNode } from "./nodes/SceneNode";
import { SourceNode } from "./nodes/SourceNode";
import { TransformerNode } from "./nodes/TransformerNode";
import { MAX_ZOOM, MIN_ZOOM } from "../show-graph-editor-constants";

const nodeTypes = {
  [NODE_TYPE_BY_KIND.device]: DeviceNode,
  [FLOW_NODE_TYPE]: FlowNode,
  [NODE_TYPE_BY_KIND.scene]: SceneNode,
  [NODE_TYPE_BY_KIND.source]: SourceNode,
  [NODE_TYPE_BY_KIND.transformer]: TransformerNode,
};

export type ShowGraphFitViewOptions = FitViewOptions;

export interface ShowGraphCanvasProps {
  readonly nodes: ShowFlowNode[];
  readonly edges: ShowFlowEdge[];
  readonly onNodesChange: OnNodesChange<ShowFlowNode>;
  readonly onEdgesChange: OnEdgesChange<ShowFlowEdge>;
  readonly beginDrag: OnNodeDrag<ShowFlowNode>;
  dragTo(moved: ShowFlowNode[]): void;
  readonly endDrag: OnNodeDrag<ShowFlowNode>;
  beginConnect(nodeId: string, handleId: string | null): void;
  endConnect(): void;
  onConnect(connection: Connection): void;
  isValidConnection(connection: Connection | ShowFlowEdge): boolean;
  createFromConnection(
    sourceId: string,
    sourceHandle: string,
    position: Position,
  ): void;
  readonly initialViewport?: ShowGraphViewport;
  onViewportChange?(viewport: ShowGraphViewport): void;
  readonly fitViewOptions: ShowGraphFitViewOptions;
  jumpToMinimapPoint(event: MouseEvent, position: Position): void;
}

export function ShowGraphCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  beginDrag,
  dragTo,
  endDrag,
  beginConnect,
  endConnect,
  onConnect,
  isValidConnection,
  createFromConnection,
  initialViewport,
  onViewportChange,
  fitViewOptions,
  jumpToMinimapPoint,
}: ShowGraphCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();
  return (
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
          if (nodeId) beginConnect(nodeId, handleId);
        }}
        onConnectEnd={(event, connectionState) => {
          endConnect();
          if (
            connectionState.toNode ||
            !connectionState.fromNode ||
            !connectionState.fromHandle
          ) {
            return;
          }
          const point = "changedTouches" in event ? event.changedTouches[0] : event;
          if (!point) return;
          const sourceHandle = connectionState.fromHandle.id;
          if (!sourceHandle) return;
          createFromConnection(
            connectionState.fromNode.id,
            sourceHandle,
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
  );
}

