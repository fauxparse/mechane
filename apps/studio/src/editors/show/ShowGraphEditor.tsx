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
import { describeDeletion } from "@mechane/commands";
import type { DeletionScope, GraphEdit } from "@mechane/commands";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
  cn,
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
  Redo2,
  Trash2,
  Undo2,
} from "@mechane/design-system";
import { DEFAULT_FLOW_COLOR, FLOW_COLORS, isFlowColor } from "@mechane/domain";
import type { GraphNode, Position, ShowGraph } from "@mechane/domain";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type {
  Dispatch,
  MutableRefObject,
  Ref,
  SetStateAction,
  MouseEvent as ReactMouseEvent,
} from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  PanOnScrollMode,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import type { Connection, FitViewOptions, OnNodeDrag, Viewport, XYPosition } from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import "./graph/show-graph-editor.css";

import { EditorPanel } from "../../components/EditorLayout/EditorLayout";
import { EditorSlot } from "../../components/EditorLayout/editor-slots";
import { CommandPalette } from "./commands/CommandPalette";
import { GraphInspector } from "./graph/GraphInspector";
import {
  absolutePosition,
  FLOW_CONTENT_ORIGIN,
  FLOW_NODE_TYPE,
  graphToFlow,
  NODE_HEIGHT,
  NODE_WIDTH,
  PLACEHOLDER_NODE_TYPE,
} from "./graph/graph-to-flow";
import type { FlowDimensions, ShowFlowEdge, ShowFlowNode } from "./graph/graph-to-flow";
import { NodeInteractionProvider } from "./graph/node-interaction";
import type { CreatableNode } from "./graph/node-kinds";
import { CREATABLE_NODES } from "./graph/node-kinds";
import { FlowNode } from "./graph/nodes/FlowNode";
import { ReactFlowBaseNode } from "./graph/nodes/ReactFlowBaseNode";
import { useEditorKeys } from "./keyboard/use-editor-keys";
import { useGraphEditing } from "./commands/use-graph-editing";
import { useUndoKeys } from "./keyboard/use-undo-keys";
import { useViewportKeys } from "./keyboard/use-viewport-keys";
import { useShowGraphEditorActions } from "./commands/use-show-graph-editor-actions";
import { useFitViewOptions, useInitialFrame } from "./graph/use-fit-view-options";
import { ShowEdgeRoutingProvider } from "./graph/ShowEdgeRoutingProvider";
import { showEdgeTypes } from "./graph/show-edge-types";
import type { ApiGraph } from "./data/api-graph";
import type { PaletteCommand } from "./commands/palette-commands";

/** Widened from React Flow's 0.5 default so a whole Show fits on screen (#21). */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 2;

const nodeTypes = {
  [PLACEHOLDER_NODE_TYPE]: ReactFlowBaseNode,
  [FLOW_NODE_TYPE]: FlowNode,
};

/** How long a refused connection's reason stays on screen. */
const MESSAGE_MS = 4000;

/**
 * The imperative camera moves the editor exposes. Zoom-to-selection is bound to
 * Shift+2 here (#37) and still exposed, because the chrome and the palette
 * drive the same capability.
 */
export interface ShowGraphEditorHandle {
  /** Frames exactly these nodes. Ignored if none of them are in the graph. */
  fitToNodes(nodeIds: string[]): void;
  /**
   * Frames the current selection. Returns false — and moves nothing — when
   * nothing is selected, so a caller can fall back to framing everything.
   */
  zoomToSelection(): boolean;
  /** Frames the whole graph. */
  fitToGraph(): void;
  /**
   * Applies edits the server made that the user didn't ask for (#111) — a
   * new Device's minted pairing code. Imperative because the editor owns the
   * graph after it opens (see `graph` above): the amendment has to reach the
   * command stack, and a prop would have to be de-duplicated on the way in.
   */
  applyAmendments(edits: readonly GraphEdit[]): void;
}

export interface ShowGraphEditorProps {
  /** The graph as the API returned it, or null while it's still loading. */
  graph: ApiGraph | null | undefined;
  /**
   * Called after every edit with what changed (#103), and the graph it
   * changed into — including the ones an undo produced, since an undo is an
   * ordinary forward command (ADR-0005). The caller owns debouncing and the
   * mutation.
   */
  onEdit?: (edits: readonly GraphEdit[], graph: ShowGraph) => void;
  /** Restores the Show Editor viewport for this browser session. */
  initialViewport?: Viewport;
  onViewportChange?(viewport: Viewport): void;
  className?: string;
  ref?: Ref<ShowGraphEditorHandle>;
}

function moveOutOfFlowDisabledReason(selectedNodes: GraphNode[]): string | undefined {
  if (selectedNodes.length === 0) return "select a Flow-local node first";
  if (selectedNodes.some((node) => node.parentId === null)) {
    return "select only Flow-local nodes";
  }
  return undefined;
}

function moveIntoFlowDisabledReason(selectedNodes: GraphNode[]): string | undefined {
  const flows = selectedNodes.filter((node) => node.kind === "flow");
  if (flows.length === 0) return "select a Flow and top-level nodes";
  if (flows.length > 1) return "select only one Flow";
  const nodes = selectedNodes.filter((node) => node.kind !== "flow");
  if (nodes.length === 0) return "select at least one top-level node";
  if (nodes.some((node) => node.parentId !== null))
    return "move nested nodes out of their Flow first";
  if (nodes.some((node) => node.kind === "device")) return "Devices cannot be moved into a Flow";
  return undefined;
}

function ShowGraphEditorInner({
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

interface ShowGraphContextMenuProps {
  menuPosition: MutableRefObject<Position>;
  screenToFlowPosition: ReturnType<typeof useReactFlow>["screenToFlowPosition"];
  selectedNodes: GraphNode[];
  create(creatable: CreatableNode, at: Position): unknown;
  fitView(options: FitViewOptions): void;
  fitViewOptions: FitViewOptions;
  initialViewport?: Viewport;
  onViewportChange?(viewport: Viewport): void;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  requestDelete(): void;
  nodes: ShowFlowNode[];
  edges: ShowFlowEdge[];
  onNodesChange: ReturnType<typeof useNodesState<ShowFlowNode>>[2];
  onEdgesChange: ReturnType<typeof useEdgesState<ShowFlowEdge>>[2];
  beginDrag: OnNodeDrag<ShowFlowNode>;
  dragTo(moved: ShowFlowNode[]): void;
  endDrag: OnNodeDrag<ShowFlowNode>;
  editing: ReturnType<typeof useGraphEditing>;
  onConnect(connection: Connection): void;
  isValidConnection(connection: Connection | ShowFlowEdge): boolean;
  jumpToMinimapPoint(event: ReactMouseEvent, position: XYPosition): void;
}

function ShowGraphContextMenu({
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
  editing,
  onConnect,
  isValidConnection,
  jumpToMinimapPoint,
}: ShowGraphContextMenuProps) {
  const selectedFlow =
    selectedNodes.length === 1 && selectedNodes[0]?.kind === "flow" ? selectedNodes[0] : null;
  return (
    <ContextMenu disabled>
      <ContextMenuTrigger
        className="h-full w-full"
        onContextMenu={(event) => {
          // The menu opens at the pointer; a node created from it lands
          // exactly there (#27), so the click is converted to flow
          // coordinates before React Flow's own transform moves on.
          menuPosition.current = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
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
            // The three halves of the drag gesture: open it, feed it each
            // frame, and land the whole thing as one undo entry (#28).
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
              editing.createSourceFromConnection(
                connectionState.fromNode.id,
                connectionState.fromHandle.id ?? "",
                screenToFlowPosition({ x: point.clientX, y: point.clientY }),
              );
            }}
            onConnect={onConnect}
            isValidConnection={(connection) => isValidConnection(connection as Connection)}
            // Deletion goes through a Command instead (see the header note).
            deleteKeyCode={null}
            // A box-select takes only what it fully encloses (#36).
            selectionMode={SelectionMode.Full}
            // Match Figma's canvas gestures (#57): an unmodified drag selects,
            // while holding Space temporarily enables panning.
            selectionKeyCode={null}
            selectionOnDrag
            panActivationKeyCode="Space"
            panOnDrag={false}
            // Plain wheel input scrolls the canvas; React Flow switches back
            // to its zoom handler while the platform zoom activation key is
            // held (Cmd on macOS, Ctrl on Windows/Linux).
            panOnScroll
            panOnScrollMode={PanOnScrollMode.Free}
            zoomOnScroll
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            defaultViewport={initialViewport}
            onViewportChange={onViewportChange}
            fitView={initialViewport === undefined}
            fitViewOptions={fitViewOptions}
            proOptions={{ hideAttribution: true }}
            aria-label="Show graph"
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} />

            {/* Both restyled in ./show-graph-editor.css — React Flow ships
                  them with hardcoded near-white chrome. */}
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
                  onClick={() => create(creatable, menuPosition.current)}
                >
                  <Icon /> {creatable.label}
                </ContextMenuItem>
              );
            })}
          </ContextMenuSubmenuContent>
        </ContextMenuSubmenu>
        {selectedFlow ? (
          <ContextMenuSubmenu>
            <ContextMenuSubmenuTrigger>
              <Pencil /> Flow color
            </ContextMenuSubmenuTrigger>
            <ContextMenuSubmenuContent>
              {FLOW_COLORS.map((color) => (
                <ContextMenuItem
                  key={color}
                  onClick={() => {
                    if (isFlowColor(color)) editing.setFlowColor(selectedFlow.id, color);
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

interface ShowGraphEditorOverlaysProps {
  selectedNodes: GraphNode[];
  editing: ReturnType<typeof useGraphEditing>;
  message: string | null;
  paletteOpen: boolean;
  setPaletteOpen: Dispatch<SetStateAction<boolean>>;
  paletteCommands: PaletteCommand[];
  pendingDelete: DeletionScope | null;
  setPendingDelete: Dispatch<SetStateAction<DeletionScope | null>>;
  confirmDelete(): void;
}

function ShowGraphEditorOverlays({
  selectedNodes,
  editing,
  message,
  paletteOpen,
  setPaletteOpen,
  paletteCommands,
  pendingDelete,
  setPendingDelete,
  confirmDelete,
}: ShowGraphEditorOverlaysProps) {
  return (
    <>
      {/* The inspector is the Show Editor's right-hand panel, contributed to
          the Editor Chrome's slot so it shares the sidebar the Canvas editor's
          Properties panel uses — one trigger collapses whichever is showing.
          The Show Editor contributes no left panel, which is why it has no left
          sidebar at all. */}
      <EditorSlot name="right">
        <EditorPanel title="Properties">
          <GraphInspector selected={selectedNodes} editing={editing} />
        </EditorPanel>
      </EditorSlot>

      {message ? (
        <p
          role="status"
          aria-live="polite"
          className="absolute inset-x-0 bottom-6 mx-auto w-fit rounded-full border border-border bg-card px-4 py-1.5 text-sm text-card-foreground shadow-lg"
        >
          {message}
        </p>
      ) : null}

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={paletteCommands} />

      {/* The one deletion worth interrupting for (#27), asked once for the
            whole selection however many Flows it contains (#36). */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {pendingDelete && pendingDelete.nonEmptyFlows.length === 1
              ? `Delete “${pendingDelete.nonEmptyFlows[0]?.name}”?`
              : "Delete these Flows?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingDelete ? `This deletes ${describeDeletion(pendingDelete)}.` : ""} You can undo
            it.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type PaletteOptions = {
  commands: ReturnType<typeof useGraphEditing>["commands"];
  selectedNodes: GraphNode[];
  selectedEdgeIds: string[];
  create(creatable: CreatableNode, at: Position): unknown;
  centreOfView(): Position;
  selectAll(): void;
  fitView(options: FitViewOptions): void;
  fitViewOptions: FitViewOptions;
  zoomToSelection(): void;
  renameSelected(): void;
  editing: ReturnType<typeof useGraphEditing>;
  say(text: string): void;
  requestDelete(): void;
  nodes: ShowFlowNode[];
};

function useShowGraphEditorPalette({
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
}: PaletteOptions): PaletteCommand[] {
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
      // One entry per node kind (#27), verb-first so typing "cre" surfaces them
      // together (#37).
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
        scope: "canvas",
        shortcut: "⌘A",
        run: selectAll,
      },
      {
        id: "fit-graph",
        label: "Fit whole Show",
        scope: "canvas",
        icon: Maximize2,
        shortcut: "⇧1",
        run: () => fitView(fitViewOptions),
      },
      {
        id: "zoom-to-selection",
        label: "Zoom to selection",
        scope: "canvas",
        shortcut: "⇧2",
        disabledReason: selectedNodes.length > 0 ? undefined : "select a node first",
        run: () => zoomToSelection(),
      },
      {
        id: "rename",
        label: "Rename node",
        scope: "selection",
        icon: Pencil,
        shortcut: "F2",
        // Rename is inherently single-target (#36).
        disabledReason: single ? undefined : "select one node first",
        run: renameSelected,
      },
      {
        id: "move-into-flow",
        label: "Move into selected Flow",
        scope: "selection",
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
        scope: "selection",
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
        scope: "selection",
        icon: Plus,
        disabledReason: single?.kind === "scene" ? undefined : "select one Scene first",
        run: () => single && editing.addVariable(single.id),
      },
      {
        id: "delete",
        label: "Delete selection",
        scope: "selection",
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

/**
 * Finds a top-level landing spot for moving nodes out of a Flow. React Flow stores a
 * child position relative to its parent, so `positionAbsolute` preserves the
 * Scene's apparent place while the search moves it just far enough away from
 * every other rendered node and Flow.
 */
/**
 * Finds one compact, non-overlapping top-level layout for moving nodes out.
 * Child positions are relative to their different Flow parents, so using each
 * child's absolute position independently makes a multi-selection look
 * scattered. The selected nodes instead share an anchor and are stacked.
 */
function moveOutPositions(nodeIds: string[], rendered: ShowFlowNode[]): Position[] {
  const nodeIdSet = new Set(nodeIds);
  const renderedById = new Map(rendered.map((node) => [node.id, node]));
  const orderedSelected: ShowFlowNode[] = [];
  for (const nodeId of nodeIds) {
    const node = renderedById.get(nodeId);
    if (node) orderedSelected.push(node);
  }
  if (orderedSelected.length === 0) return nodeIds.map(() => ({ x: 0, y: 0 }));

  const origin = {
    x: Math.min(...orderedSelected.map((node) => absolutePosition(node, renderedById).x)),
    y: Math.min(...orderedSelected.map((node) => absolutePosition(node, renderedById).y)),
  };
  const obstacles = rendered.reduce<ReturnType<typeof rectangleFor>[]>((obstacles, node) => {
    if (!nodeIdSet.has(node.id)) {
      obstacles.push(rectangleFor(node, absolutePosition(node, renderedById)));
    }
    return obstacles;
  }, []);
  const sizes = orderedSelected.map((node) => ({
    width: Number(node.style?.width ?? NODE_WIDTH),
    height: Number(node.style?.height ?? 56),
  }));

  const layoutAt = (anchor: Position): Position[] => {
    let y = anchor.y;
    return sizes.map((size) => {
      const position = { x: anchor.x, y };
      y += size.height + 32;
      return position;
    });
  };
  const isFree = (positions: Position[]) =>
    positions.length === sizes.length &&
    positions.every((position, index) => {
      const size = sizes[index]!;
      return !obstacles.some((obstacle) => overlaps(position, size, obstacle));
    });

  for (let radius = 0; radius <= 40; radius += 1) {
    const distance = radius * 32;
    const candidates =
      radius === 0
        ? [origin]
        : [
            { x: origin.x + distance, y: origin.y },
            { x: origin.x - distance, y: origin.y },
            { x: origin.x, y: origin.y + distance },
            { x: origin.x, y: origin.y - distance },
          ];
    const candidate = candidates.find((position) => isFree(layoutAt(position)));
    if (candidate) return layoutAt(candidate);
  }
  return layoutAt({ x: origin.x + 32, y: origin.y + 32 });
}

function rectangleFor(node: ShowFlowNode, position: Position) {
  const width = Number(node.style?.width ?? NODE_WIDTH);
  const height = Number(node.style?.height ?? 56);
  return {
    left: position.x,
    top: position.y,
    right: position.x + width,
    bottom: position.y + height,
  };
}

function overlaps(
  position: Position,
  size: { width: number; height: number },
  obstacle: ReturnType<typeof rectangleFor>,
): boolean {
  return (
    position.x < obstacle.right &&
    position.x + size.width > obstacle.left &&
    position.y < obstacle.bottom &&
    position.y + size.height > obstacle.top
  );
}

/**
 * Renders a Show's graph. Wraps its own `<ReactFlowProvider>` so the
 * imperative viewport API is available to the keyboard hooks and to the handle
 * above — the route doesn't have to know React Flow needs one.
 */
export function ShowGraphEditor(props: ShowGraphEditorProps) {
  return (
    <ReactFlowProvider>
      <ShowGraphEditorInner {...props} />
    </ReactFlowProvider>
  );
}

export type { ShowFlowNode };
