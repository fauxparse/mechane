// The Show editor's graph surface: the camera (issue #40, spec'd by #21) plus
// the interaction slice (issue #42, spec'd by #27, #35, #36, #37).
//
// Camera decisions worth not re-litigating (#21):
//
//   - `minZoom: 0.1` is widened from React Flow's 0.5 floor, so a director can
//     pull back far enough to see a whole Show at once.
//   - `<Controls/>` and `<MiniMap/>` are React Flow's own, restyled — they ship
//     hardcoded white chrome and are unreadable on a dark background, so
//     ./show-graph-editor.css is load-bearing, not polish.
//   - Wheel scrolls, Cmd/Ctrl+wheel zooms, click-drag box-selects, and
//     Space+drag pans: the Figma-compatible pointer model (#57).
//
// Editing decisions (#42):
//
//   - **Every mutation is a Command** (#41), which is what makes Cmd+Z work and
//     what carries edits to the server (ADR-0005 — one path, undo included).
//     The graph drawn here is the command stack's state, not the query result.
//   - **React Flow's own deletion is off** (`deleteKeyCode={null}`). Backspace
//     has to go through a Command so a cascading delete is one undo entry, and
//     a non-empty Flow gets its confirmation first (#27, #28, #36).
//   - **`selectionMode: Full`** (#36): these nodes are large — a Flow can be
//     ~560px across — so under React Flow's `Partial` default a drag clipping
//     one corner would select a whole Flow and its contents.
//   - **Everything else about selection is React Flow's** (#36): Shift+drag
//     box-select, Cmd/Ctrl+click to toggle, Tab/Enter/arrows for keyboard
//     a11y, kept on wholesale rather than reimplemented.
//   - **A drag's valid targets are the domain's answer** (`connectionTargets`),
//     computed once at drag start; the affordance itself is #35's dashed
//     outline plus dimming, painted by the graph node adapters.
import type { DeletionScope } from "@mechane/commands";
import { cn } from "@mechane/design-system";
import type { Position } from "@mechane/domain";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useEdgesState, useNodesState, useReactFlow } from "@xyflow/react";
import type { Connection } from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import "./graph/show-graph-editor.css";

import "@xyflow/react/dist/style.css";
import { absolutePosition, graphToFlow, NODE_HEIGHT, NODE_WIDTH } from "./graph/graph-to-flow";
import type { FlowDimensions, ShowFlowNode } from "./graph/graph-to-flow";
import { NodeInteractionProvider } from "./graph/node-interaction";
import { useEditorKeys } from "./keyboard/use-editor-keys";
import { useGraphEditing } from "./commands/use-graph-editing";
import { useUndoKeys } from "./keyboard/use-undo-keys";
import { useViewportKeys } from "./keyboard/use-viewport-keys";
import { useShowGraphEditorActions } from "./commands/use-show-graph-editor-actions";
import { useFitViewOptions, useInitialFrame } from "./graph/use-fit-view-options";
import { useShowGraphEditorPalette } from "./commands/use-show-graph-editor-palette";
import { ShowGraphContextMenu } from "./ShowGraphContextMenu";
import { ShowGraphEditorOverlays } from "./ShowGraphEditorOverlays";
import { MESSAGE_MS } from "./show-graph-editor-constants";
import type { ShowGraphEditorProps } from "./ShowGraphEditor";

export function ShowGraphEditorInner({
  graph,
  onEdit,
  initialViewport,
  onViewportChange,
  className,
  ref,
}: ShowGraphEditorProps) {
  const editing = useGraphEditing(graph, onEdit);
  const { commands } = editing;
  // Collapse is deliberately local view state (#44): it never enters the
  // graph, command stack, persistence, or undo history.
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
      if (previous?.width === dimensions.width && previous.height === dimensions.height) {
        return current;
      }
      const next = new Map(current);
      next.set(flowId, dimensions);
      return next;
    });
  }, []);
  const [nodes, setNodes, onNodesChange] = useNodesState(drawn.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(drawn.edges);
  const { fitView, getNodes, getZoom, setCenter, screenToFlowPosition } = useReactFlow();
  // Framing targets the Editable Area, not the viewport the graph paints into.
  const fitViewOptions = useFitViewOptions();
  useInitialFrame(fitView, fitViewOptions, initialViewport === undefined);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DeletionScope | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** Where the last right-click landed, in flow coordinates (#27 places there). */
  const menuPosition = useRef<Position>({ x: 0, y: 0 });

  useViewportKeys();
  useUndoKeys(commands);

  // React Flow owns the *interaction* state — which nodes are selected, which
  // is mid-drag — and it lives on the same objects as the positions, so a
  // redraw has to carry it across or clicking a node would deselect it.
  const dragging = useRef(false);
  // A node created this render isn't in React Flow's nodes yet, so "select the
  // thing I just made" has to be handed to the redraw below rather than set
  // directly — a `setNodes` before it would be overwritten by it.
  const selectOnArrival = useRef<string | null>(null);
  /** A newly created Flow should become the camera's destination (#64). */
  const focusOnArrival = useRef<string | null>(null);
  useEffect(() => {
    // While a drag is in flight React Flow is already showing the right
    // positions, frame by frame; replacing its nodes underneath it would
    // interrupt the very gesture that's producing them.
    if (dragging.current) return;
    const arriving = selectOnArrival.current;
    selectOnArrival.current = null;
    const focusId = focusOnArrival.current;
    focusOnArrival.current = null;
    if (focusId) {
      // React Flow has not received the replacement nodes until this effect's
      // state update commits, so wait one frame before asking it for the new
      // Flow's absolute position.
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
        if (arriving) return { ...node, selected: node.id === arriving };
        const existing = interaction.get(node.id);
        return existing ? { ...node, selected: existing.selected } : node;
      });
    });
    setEdges((previous) => {
      const interaction = new Map(previous.map((edge) => [edge.id, edge]));
      return drawn.edges.map((edge) => {
        const existing = interaction.get(edge.id);
        return existing ? { ...edge, selected: existing.selected } : edge;
      });
    });
  }, [drawn, getNodes, getZoom, setCenter, setNodes, setEdges]);

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

  const {
    beginDrag,
    dragTo,
    endDrag,
    create,
    centreOfView,
    requestDelete,
    confirmDelete,
    onConnect,
    isValidConnection,
    fitToNodes,
    zoomToSelection,
    jumpToMinimapPoint,
  } = useShowGraphEditorActions({
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

  useImperativeHandle(
    ref,
    () => ({
      fitToNodes,
      zoomToSelection,
      fitToGraph: () => fitView(fitViewOptions),
      applyAmendments: editing.amend,
    }),
    [editing.amend, fitToNodes, fitView, fitViewOptions, zoomToSelection],
  );

  // ---------------------------------------------------------------------------
  // Keyboard and palette
  // ---------------------------------------------------------------------------

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
        "delete-selection": requestDelete,
        rename: renameSelected,
        "select-all": selectAll,
        "fit-graph": () => fitView(fitViewOptions),
        "zoom-to-selection": () => {
          if (!zoomToSelection()) fitView(fitViewOptions);
        },
        deselect,
      }),
      [
        deselect,
        fitView,
        fitViewOptions,
        renameSelected,
        requestDelete,
        selectAll,
        zoomToSelection,
      ],
    ),
  );

  const paletteCommands = useShowGraphEditorPalette({
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
    editing,
    say,
    requestDelete,
    nodes,
  });

  const interaction = useMemo(
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

  return (
    <NodeInteractionProvider value={interaction}>
      {/* `mechane-show-graph` is what ./show-graph-editor.css hangs its
          overrides off, so they can't leak into another React Flow instance. */}
      <div
        className={cn("mechane-show-graph relative h-full w-full bg-background", className)}
        data-flow-theme="neutral"
      >
        <ShowGraphContextMenu
          menuPosition={menuPosition}
          selectedNodes={selectedNodes}
          screenToFlowPosition={screenToFlowPosition}
          create={create}
          fitView={fitView}
          fitViewOptions={fitViewOptions}
          initialViewport={initialViewport}
          onViewportChange={onViewportChange}
          selectedNodeIds={selectedNodeIds}
          selectedEdgeIds={selectedEdgeIds}
          requestDelete={requestDelete}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          beginDrag={beginDrag}
          dragTo={dragTo}
          endDrag={endDrag}
          editing={editing}
          onConnect={onConnect}
          isValidConnection={(connection) => isValidConnection(connection as Connection)}
          jumpToMinimapPoint={jumpToMinimapPoint}
        />

        <ShowGraphEditorOverlays
          selectedNodes={selectedNodes}
          editing={editing}
          message={message}
          paletteOpen={paletteOpen}
          setPaletteOpen={setPaletteOpen}
          paletteCommands={paletteCommands}
          pendingDelete={pendingDelete}
          setPendingDelete={setPendingDelete}
          confirmDelete={confirmDelete}
        />
      </div>
    </NodeInteractionProvider>
  );
}
