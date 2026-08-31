import type { DeletionScope } from "@mechane/commands";
import { defaultSourceValues, type GraphNode, type Position } from "@mechane/domain";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useEdgesState, useNodesInitialized, useNodesState, useReactFlow } from "@xyflow/react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { OnEdgesChange, OnNodesChange } from "@xyflow/react";

import { absolutePosition, graphToFlow, NODE_HEIGHT, NODE_WIDTH } from "../graph/graph-to-flow";
import type { FlowDimensions, ShowFlowEdge, ShowFlowNode } from "../graph/graph-to-flow";
import { reconcileEdges, reconcileNodes } from "../graph/reconcile-nodes";
import { useEditorKeys } from "../keyboard/use-editor-keys";
import { useGraphEditing } from "./use-graph-editing";
import { graphInspectorEditing } from "./use-graph-editing";
import type {
  GraphCommandEditing,
  GraphConnectionEditing,
  GraphCreationEditing,
  GraphDeletionEditing,
  GraphGestureEditing,
  GraphInspectorEditing,
} from "./use-graph-editing";
import { useUndoKeys } from "../keyboard/use-undo-keys";
import { useViewportKeys } from "../keyboard/use-viewport-keys";
import { useShowGraphEditorActions } from "./use-show-graph-editor-actions";
import { useFitViewOptions, useInitialFrame } from "../graph/use-fit-view-options";
import { useShowGraphEditorPalette } from "./use-show-graph-editor-palette";
import { MESSAGE_MS } from "../show-graph-editor-constants";
import type { ShowGraphEditorProps } from "../ShowGraphEditor";
import type { PaletteCommand } from "./palette-commands";
import type { EdgeInteraction } from "../graph/edge-interaction";
import type { NodeInteraction } from "../graph/node-interaction";

export interface ShowGraphEditorController {
  command: GraphCommandEditing;
  gestures: GraphGestureEditing;
  creation: GraphCreationEditing;
  deletion: GraphDeletionEditing;
  connections: GraphConnectionEditing;
  inspector: GraphInspectorEditing;
  menuPosition: MutableRefObject<Position>;
  selectedNodes: GraphNode[];
  nodes: ShowFlowNode[];
  edges: ShowFlowEdge[];
  onNodesChange: OnNodesChange<ShowFlowNode>;
  onEdgesChange: OnEdgesChange<ShowFlowEdge>;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  beginDrag: ReturnType<typeof useShowGraphEditorActions>["beginDrag"];
  dragTo: ReturnType<typeof useShowGraphEditorActions>["dragTo"];
  endDrag: ReturnType<typeof useShowGraphEditorActions>["endDrag"];
  create: ReturnType<typeof useShowGraphEditorActions>["create"];
  requestDelete: ReturnType<typeof useShowGraphEditorActions>["requestDelete"];
  fitView: ReturnType<typeof useReactFlow>["fitView"];
  fitViewOptions: ReturnType<typeof useFitViewOptions>;
  screenToFlowPosition: ReturnType<typeof useReactFlow>["screenToFlowPosition"];
  onConnect: ReturnType<typeof useShowGraphEditorActions>["onConnect"];
  isValidConnection: ReturnType<typeof useShowGraphEditorActions>["isValidConnection"];
  jumpToMinimapPoint: ReturnType<typeof useShowGraphEditorActions>["jumpToMinimapPoint"];
  paletteCommands: PaletteCommand[];
  paletteOpen: boolean;
  setPaletteOpen: Dispatch<SetStateAction<boolean>>;
  pendingDelete: DeletionScope | null;
  setPendingDelete: Dispatch<SetStateAction<DeletionScope | null>>;
  message: string | null;
  confirmDelete: ReturnType<typeof useShowGraphEditorActions>["confirmDelete"];
  interaction: NodeInteraction;
  edgeInteraction: EdgeInteraction;
}

export function useShowGraphEditorController({
  graph,
  onEdit,
  initialViewport,
  ref,
}: ShowGraphEditorProps): ShowGraphEditorController {
  const editing = useGraphEditing(graph, onEdit);
  const { command, gestures, creation, deletion, connections, variables } = editing;
  const { commands } = command;
  const [collapsedFlowIds, setCollapsedFlowIds] = useState<Set<string>>(() => new Set());
  const [flowDimensions, setFlowDimensions] = useState<Map<string, FlowDimensions>>(
    () => new Map(),
  );
  const sourceValues = useMemo(() => defaultSourceValues(command.graph), [command.graph]);
  const drawn = useMemo(
    () => graphToFlow(command.graph, { collapsedFlowIds, flowDimensions, sourceValues }),
    [collapsedFlowIds, command.graph, flowDimensions, sourceValues],
  );
  const toggleCollapse = useCallback((flowId: string) => {
    setCollapsedFlowIds((current) => {
      const next = new Set(current);
      if (next.has(flowId)) next.delete(flowId);
      else next.add(flowId);
      return next;
    });
  }, []);
  const resizeFlow = useCallback((flowId: string, dimensions: FlowDimensions) => {
    setFlowDimensions((current) => {
      const previous = current.get(flowId);
      if (previous?.width === dimensions.width && previous.height === dimensions.height)
        return current;
      const next = new Map(current);
      next.set(flowId, dimensions);
      return next;
    });
  }, []);
  const dragging = useRef(false);
  const selectOnArrival = useRef<string | null>(null);
  const focusOnArrival = useRef<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(drawn.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(drawn.edges);
  const manualFlowIds = useMemo(() => new Set(flowDimensions.keys()), [flowDimensions]);
  const displayNodes = useMemo(
    () =>
      reconcileNodes(drawn.nodes, nodes, {
        dragging: dragging.current,
        manualFlowIds,
      }),
    [drawn.nodes, manualFlowIds, nodes],
  );
  const displayEdges = useMemo(() => reconcileEdges(drawn.edges, edges), [drawn.edges, edges]);
  const { fitView, getNodes, getZoom, setCenter, screenToFlowPosition } = useReactFlow();
  const fitViewOptions = useFitViewOptions();
  // The graph arrives after the editor mounts; fit only after its nodes are measured.
  const nodesInitialized = useNodesInitialized();
  const initialViewportFitted = useRef(false);
  useEffect(() => {
    if (
      initialViewport !== undefined ||
      graph === null ||
      graph === undefined ||
      graph.nodes.length === 0 ||
      !nodesInitialized ||
      initialViewportFitted.current
    ) {
      return;
    }
    initialViewportFitted.current = true;
    fitView(fitViewOptions);
  }, [fitView, fitViewOptions, graph, initialViewport, nodesInitialized]);
  useInitialFrame(
    fitView,
    fitViewOptions,
    initialViewport === undefined && graph !== null && graph !== undefined,
  );

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DeletionScope | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const menuPosition = useRef<Position>({ x: 0, y: 0 });

  useViewportKeys();
  useUndoKeys(commands);

  useEffect(() => {
    const arriving = selectOnArrival.current;
    selectOnArrival.current = null;
    const focusId = focusOnArrival.current;
    focusOnArrival.current = null;
    if (focusId) {
      window.requestAnimationFrame(() => {
        const rendered = getNodes() as ShowFlowNode[];
        const target = rendered.find((node) => node.id === focusId);
        if (!target) return;
        const position = absolutePosition(target, new Map(rendered.map((node) => [node.id, node])));
        const width = Number(target.style?.width ?? NODE_WIDTH);
        const height = Number(target.style?.height ?? NODE_HEIGHT);
        setCenter(position.x + width / 2, position.y + height / 2, {
          zoom: getZoom(),
          duration: 200,
        });
      });
    }
    setNodes((previous) =>
      reconcileNodes(drawn.nodes, previous, {
        dragging: dragging.current,
        manualFlowIds,
        selectOnArrival: arriving,
      }),
    );
    setEdges((previous) => reconcileEdges(drawn.edges, previous));
  }, [drawn, getNodes, getZoom, manualFlowIds, setCenter, setEdges, setNodes]);

  const say = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(
      () => setMessage((current) => (current === text ? null : current)),
      MESSAGE_MS,
    );
  }, []);
  const selectedNodeIds = useMemo(() => {
    const ids: string[] = [];
    for (const node of nodes) {
      if (node.selected) ids.push(node.id);
    }
    return ids;
  }, [nodes]);
  const selectedEdgeIds = useMemo(() => {
    const ids: string[] = [];
    for (const edge of edges) {
      if (edge.selected) ids.push(edge.id);
    }
    return ids;
  }, [edges]);
  const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const selectedNodes = useMemo(
    () => command.graph.nodes.filter((node) => selectedNodeIdSet.has(node.id)),
    [command.graph.nodes, selectedNodeIdSet],
  );
  const actions = useShowGraphEditorActions({
    graph: command.graph,
    commands,
    creation,
    deletion,
    connections,
    selectedNodes,
    selectedNodeIds,
    selectedEdgeIds,
    getNodes,
    getZoom,
    setCenter,
    fitView,
    fitViewOptions,
    screenToFlowPosition,
    say,
    setPendingDelete,
    dragging,
    selectOnArrival,
    focusOnArrival,
  });

  const selectAll = useCallback(() => {
    setNodes((previous) => previous.map((node) => ({ ...node, selected: true })));
    setEdges((previous) => previous.map((edge) => ({ ...edge, selected: true })));
  }, [setEdges, setNodes]);
  const deselect = useCallback(() => {
    if (gestures.renaming) {
      gestures.cancelRename();
      return;
    }
    setNodes((previous) => previous.map((node) => ({ ...node, selected: false })));
    setEdges((previous) => previous.map((edge) => ({ ...edge, selected: false })));
  }, [gestures, setEdges, setNodes]);
  const renameSelected = useCallback(() => {
    const [only] = selectedNodeIds;
    if (!only || selectedNodeIds.length > 1) return;
    gestures.beginRename(only);
  }, [gestures, selectedNodeIds]);
  useEditorKeys(
    useMemo(
      () => ({
        "open-palette": () => setPaletteOpen(true),
        "delete-selection": actions.requestDelete,
        rename: renameSelected,
        "select-all": selectAll,
        // Blocks are made from Canvas Elements, so the Show editor has nothing to do here.
        "create-block": () => {},
        "fit-graph": () => fitView(fitViewOptions),
        "zoom-to-selection": () => {
          if (!actions.zoomToSelection()) fitView(fitViewOptions);
        },
        deselect,
      }),
      [actions, deselect, fitView, fitViewOptions, renameSelected, selectAll],
    ),
  );
  const paletteCommands = useShowGraphEditorPalette({
    commands,
    selectedNodes,
    selectedEdgeIds,
    create: actions.create,
    centreOfView: actions.centreOfView,
    selectAll,
    fitView,
    fitViewOptions,
    zoomToSelection: actions.zoomToSelection,
    renameSelected,
    moveIntoFlow: editing.moveIntoFlow,
    moveOutOfFlow: editing.moveOutOfFlow,
    addVariable: variables.addVariable,
    say,
    requestDelete: actions.requestDelete,
    nodes,
  });
  const interaction = useMemo<NodeInteraction>(
    () => ({
      renaming: gestures.renaming,
      beginRename: gestures.beginRename,
      renameTo: gestures.renameTo,
      commitRename: gestures.commitRename,
      cancelRename: gestures.cancelRename,
      connecting: connections.connecting,
      targets: connections.targets,
      toggleCollapse,
      resizeFlow,
    }),
    [connections, gestures, resizeFlow, toggleCollapse],
  );
  const edgeInteraction = useMemo<EdgeInteraction>(
    () => ({ moveEdge: editing.edges.moveEdge }),
    [editing.edges.moveEdge],
  );

  useImperativeHandle(
    ref,
    () => ({
      fitToNodes: actions.fitToNodes,
      zoomToSelection: actions.zoomToSelection,
      fitToGraph: () => fitView(fitViewOptions),
      applyAmendments: command.amend,
    }),
    [actions.fitToNodes, actions.zoomToSelection, command.amend, fitView, fitViewOptions],
  );

  return {
    command,
    gestures,
    creation,
    deletion,
    connections,
    inspector: graphInspectorEditing(command.graph, gestures, variables, editing.sourceValues, {
      setNodeColor: editing.setNodeColor,
      setDevicePerConnection: editing.setDevicePerConnection,
      setSourceType: editing.setSourceType,
    }),
    menuPosition,
    selectedNodes,
    fitView,
    fitViewOptions,
    nodes: displayNodes,
    screenToFlowPosition,
    edges: displayEdges,
    onNodesChange,
    onEdgesChange,
    selectedNodeIds,
    selectedEdgeIds,
    ...actions,
    paletteCommands,
    paletteOpen,
    setPaletteOpen,
    pendingDelete,
    setPendingDelete,
    message,
    confirmDelete: actions.confirmDelete,
    interaction,
    edgeInteraction,
  };
}
