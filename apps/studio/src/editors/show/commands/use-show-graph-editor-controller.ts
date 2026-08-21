import type { DeletionScope } from "@mechane/commands";
import type { GraphNode, Position } from "@mechane/domain";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useEdgesState, useNodesState, useReactFlow } from "@xyflow/react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { OnEdgesChange, OnNodesChange } from "@xyflow/react";

import {
  absolutePosition,
  FLOW_NODE_TYPE,
  graphToFlow,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "../graph/graph-to-flow";
import type { FlowDimensions, ShowFlowEdge, ShowFlowNode } from "../graph/graph-to-flow";
import { useEditorKeys } from "../keyboard/use-editor-keys";
import { useGraphEditing } from "./use-graph-editing";
import { useUndoKeys } from "../keyboard/use-undo-keys";
import { useViewportKeys } from "../keyboard/use-viewport-keys";
import { useShowGraphEditorActions } from "./use-show-graph-editor-actions";
import { useFitViewOptions, useInitialFrame } from "../graph/use-fit-view-options";
import { useShowGraphEditorPalette } from "./use-show-graph-editor-palette";
import { MESSAGE_MS } from "../show-graph-editor-constants";
import type { ShowGraphEditorProps } from "../ShowGraphEditor";
import type { PaletteCommand } from "./palette-commands";
import type { NodeInteraction } from "../graph/node-interaction";

export interface ShowGraphEditorController {
  editing: ReturnType<typeof useGraphEditing>;
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
}

export function useShowGraphEditorController({
  graph,
  onEdit,
  initialViewport,
  ref,
}: ShowGraphEditorProps): ShowGraphEditorController {
  const editing = useGraphEditing(graph, onEdit);
  const { commands } = editing;
  const [collapsedFlowIds, setCollapsedFlowIds] = useState<Set<string>>(() => new Set());
  const [flowDimensions, setFlowDimensions] = useState<Map<string, FlowDimensions>>(
    () => new Map(),
  );
  const drawn = useMemo(
    () => graphToFlow(editing.graph, { collapsedFlowIds, flowDimensions }),
    [collapsedFlowIds, editing.graph, flowDimensions],
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
  const displayNodes = useMemo(() => {
    const interaction = new Map(nodes.map((node) => [node.id, node]));
    return drawn.nodes.map((node) => {
      const existing = interaction.get(node.id);
      if (!existing) return node;
      const collapseChanged =
        node.type === FLOW_NODE_TYPE &&
        existing.type === FLOW_NODE_TYPE &&
        existing.data.collapsed !== node.data.collapsed;
      return {
        ...existing,
        ...node,
        ...(collapseChanged ? { measured: undefined } : {}),
        position:
          dragging.current || (node.type === FLOW_NODE_TYPE && flowDimensions.has(node.id))
            ? existing.position
            : node.position,
        selected: existing.selected,
      };
    });
  }, [drawn, flowDimensions, nodes]);
  const { fitView, getNodes, getZoom, setCenter, screenToFlowPosition } = useReactFlow();
  const fitViewOptions = useFitViewOptions();
  useInitialFrame(fitView, fitViewOptions, initialViewport === undefined);

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
    setNodes((previous) => {
      const interaction = new Map(previous.map((node) => [node.id, node]));
      return drawn.nodes.map((node) => {
        const existing = interaction.get(node.id);
        if (!existing) return arriving ? { ...node, selected: node.id === arriving } : node;
        const collapseChanged =
          node.type === FLOW_NODE_TYPE &&
          existing.type === FLOW_NODE_TYPE &&
          existing.data.collapsed !== node.data.collapsed;
        return {
          ...existing,
          ...node,
          ...(collapseChanged ? { measured: undefined } : {}),
          ...(dragging.current || (node.type === FLOW_NODE_TYPE && flowDimensions.has(node.id))
            ? { position: existing.position }
            : {}),
          selected: arriving ? node.id === arriving : existing.selected,
        };
      });
    });
    setEdges((previous) => {
      const interaction = new Map(previous.map((edge) => [edge.id, edge]));
      return drawn.edges.map((edge) => {
        const existing = interaction.get(edge.id);
        return existing ? { ...existing, ...edge, selected: existing.selected } : edge;
      });
    });
  }, [drawn, flowDimensions, getNodes, getZoom, setCenter, setNodes, setEdges]);

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
    () => editing.graph.nodes.filter((node) => selectedNodeIdSet.has(node.id)),
    [editing.graph.nodes, selectedNodeIdSet],
  );
  const actions = useShowGraphEditorActions({
    editing,
    commands,
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
    if (editing.renaming) {
      editing.cancelRename();
      return;
    }
    setNodes((previous) => previous.map((node) => ({ ...node, selected: false })));
    setEdges((previous) => previous.map((edge) => ({ ...edge, selected: false })));
  }, [editing, setEdges, setNodes]);
  const renameSelected = useCallback(() => {
    const [only] = selectedNodeIds;
    if (!only || selectedNodeIds.length > 1) return;
    editing.beginRename(only);
  }, [editing, selectedNodeIds]);
  useEditorKeys(
    useMemo(
      () => ({
        "open-palette": () => setPaletteOpen(true),
        "delete-selection": actions.requestDelete,
        rename: renameSelected,
        "select-all": selectAll,
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
    editing,
    say,
    requestDelete: actions.requestDelete,
    nodes,
  });
  const interaction = useMemo<NodeInteraction>(
    () => ({
      renaming: editing.renaming,
      beginRename: editing.beginRename,
      renameTo: editing.renameTo,
      commitRename: editing.commitRename,
      cancelRename: editing.cancelRename,
      connecting: editing.connecting,
      targets: editing.targets,
      toggleCollapse,
      resizeFlow,
    }),
    [editing, resizeFlow, toggleCollapse],
  );

  useImperativeHandle(
    ref,
    () => ({
      fitToNodes: actions.fitToNodes,
      zoomToSelection: actions.zoomToSelection,
      fitToGraph: () => fitView(fitViewOptions),
      applyAmendments: editing.amend,
    }),
    [actions.fitToNodes, actions.zoomToSelection, editing.amend, fitView, fitViewOptions],
  );

  return {
    editing,
    menuPosition,
    selectedNodes,
    fitView,
    fitViewOptions,
    nodes: displayNodes,
    screenToFlowPosition,
    edges,
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
  };
}
