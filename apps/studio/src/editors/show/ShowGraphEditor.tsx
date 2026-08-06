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
//     outline plus dimming, painted by ./ShowGraphNodes.
import { composite, describeDeletion, moveNode } from "@mechane/commands";
import type { DeletionScope } from "@mechane/commands";
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
} from "@mechane/design-system";
import type { GraphNode, NodeKind, Position, ShowGraph } from "@mechane/domain";
import { Maximize2, Pencil, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, Ref } from "react";
import ReactFlow, {
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
} from "reactflow";
import type { Connection, FitViewOptions, XYPosition } from "reactflow";

import "reactflow/dist/style.css";
import "./show-graph-editor.css";

import { CommandPalette } from "./CommandPalette";
import { GraphInspector } from "./GraphInspector";
import { FLOW_NODE_TYPE, graphToFlow, NODE_WIDTH, PLACEHOLDER_NODE_TYPE } from "./graph-to-flow";
import type { ShowFlowNode } from "./graph-to-flow";
import { NodeInteractionProvider } from "./node-interaction";
import { CREATABLE_KINDS, NODE_KIND_META } from "./node-kinds";
import { ShowFlowNode as FlowNodeBody, ShowNode } from "./ShowGraphNodes";
import { useEditorKeys } from "./use-editor-keys";
import { useGraphEditing } from "./use-graph-editing";
import { useUndoKeys } from "./use-undo-keys";
import { useViewportKeys } from "./use-viewport-keys";
import type { ApiGraph } from "./api-graph";
import type { PaletteCommand } from "./palette-commands";

/** Widened from React Flow's 0.5 default so a whole Show fits on screen (#21). */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 2;

// Framing never zooms past 1:1 — a two-node selection filling the screen at
// 2× is disorienting rather than helpful.
const FIT_VIEW_OPTIONS: FitViewOptions = { padding: 0.2, maxZoom: 1, duration: 200 };

const nodeTypes = {
  [PLACEHOLDER_NODE_TYPE]: ShowNode,
  [FLOW_NODE_TYPE]: FlowNodeBody,
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
}

export interface ShowGraphEditorProps {
  /** The graph as the API returned it, or null while it's still loading. */
  graph: ApiGraph | null | undefined;
  /**
   * Called with the graph after every edit — including the ones an undo
   * produced, since an undo is an ordinary forward command (ADR-0005). The
   * caller owns debouncing and the mutation.
   */
  onEdit?: (graph: ShowGraph) => void;
  className?: string;
  ref?: Ref<ShowGraphEditorHandle>;
}

function ShowGraphEditorInner({ graph, onEdit, className, ref }: ShowGraphEditorProps) {
  const editing = useGraphEditing(graph, onEdit);
  const { commands } = editing;
  const drawn = useMemo(() => graphToFlow(editing.graph), [editing.graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(drawn.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(drawn.edges);
  const { fitView, getNodes, getZoom, setCenter, screenToFlowPosition, project } = useReactFlow();

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
  useEffect(() => {
    // While a drag is in flight React Flow is already showing the right
    // positions, frame by frame; replacing its nodes underneath it would
    // interrupt the very gesture that's producing them.
    if (dragging.current) return;
    const arriving = selectOnArrival.current;
    selectOnArrival.current = null;
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
  }, [drawn, setNodes, setEdges]);

  const say = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(
      () => setMessage((current) => (current === text ? null : current)),
      MESSAGE_MS,
    );
  }, []);

  const selectedNodeIds = useMemo(
    () => nodes.filter((node) => node.selected).map((node) => node.id),
    [nodes],
  );
  const selectedEdgeIds = useMemo(
    () => edges.filter((edge) => edge.selected).map((edge) => edge.id),
    [edges],
  );
  const selectedNodes = useMemo(
    () => editing.graph.nodes.filter((node) => selectedNodeIds.includes(node.id)),
    [editing.graph.nodes, selectedNodeIds],
  );

  // ---------------------------------------------------------------------------
  // Moving
  // ---------------------------------------------------------------------------

  const { beginGesture } = commands;
  const dragGesture = useRef<ReturnType<typeof beginGesture> | null>(null);

  const beginDrag = useCallback(() => {
    dragging.current = true;
    dragGesture.current = beginGesture({ key: "drag", label: "Move" });
  }, [beginGesture]);

  const dragTo = useCallback((moved: ShowFlowNode[]) => {
    // A mixed-scope selection can't be dragged coherently (#36): React Flow
    // pins nested children to their Flow, so top-level members would move
    // freely while nested ones clamped, silently deforming the selection.
    const parents = new Set(moved.map((node) => node.parentNode ?? null));
    if (parents.size > 1) return;
    dragGesture.current?.update(
      moveComposite(moved.map((node) => ({ id: node.id, position: node.position }))),
    );
  }, []);

  const endDrag = useCallback(
    (_event: ReactMouseEvent, _node: ShowFlowNode, moved: ShowFlowNode[]) => {
      dragTo(moved);
      dragging.current = false;
      dragGesture.current?.commit();
      dragGesture.current = null;
    },
    [dragTo],
  );

  // ---------------------------------------------------------------------------
  // Creating
  // ---------------------------------------------------------------------------

  /**
   * The Flow a point lands inside, if any — so a node created by right-clicking
   * within a Flow's boundary belongs to that Flow. Containment *is* placement
   * (#29), so this is the whole of "created inside a Flow".
   */
  const flowAt = useCallback(
    (point: Position): ShowFlowNode | null =>
      getNodes().find((node) => {
        if (node.type !== FLOW_NODE_TYPE) return false;
        const width = Number(node.style?.width ?? NODE_WIDTH);
        const height = Number(node.style?.height ?? 0);
        return (
          point.x >= node.position.x &&
          point.x <= node.position.x + width &&
          point.y >= node.position.y &&
          point.y <= node.position.y + height
        );
      }) ?? null,
    [getNodes],
  );

  const create = useCallback(
    (kind: NodeKind, at: Position) => {
      const flow = kind === "flow" || kind === "device" ? null : flowAt(at);
      // A nested node's position is relative to its Flow (#29), which is
      // exactly how React Flow reads it too.
      const position = flow ? { x: at.x - flow.position.x, y: at.y - flow.position.y } : at;
      // A freshly created node becomes the selection, so the inspector opens on
      // it and F2 renames it without a click first.
      const node = editing.createNodeOfKind(kind, position, flow?.id ?? null);
      selectOnArrival.current = node.id;
      return node;
    },
    [editing, flowAt],
  );

  /** Where a palette-created node goes: near the selection, else viewport centre (#27). */
  const centreOfView = useCallback((): Position => {
    const selected = getNodes().filter((node) => node.selected);
    if (selected.length > 0) {
      const first = selected[0] as ShowFlowNode;
      return { x: first.position.x + NODE_WIDTH + 48, y: first.position.y };
    }
    const bounds = document.querySelector(".mechane-show-graph")?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return project({ x: bounds.width / 2 - NODE_WIDTH / 2, y: bounds.height / 2 });
  }, [getNodes, project]);

  // ---------------------------------------------------------------------------
  // Deleting
  // ---------------------------------------------------------------------------

  const requestDelete = useCallback(() => {
    const scope = editing.scopeOf(selectedNodeIds, selectedEdgeIds);
    if (scope.nodes.length === 0 && scope.edgeIds.length === 0) return;
    // Undo is the safety net for everything except a non-empty Flow, whose
    // blast radius earns an interruption — once, for the whole selection
    // (#27, #36).
    if (scope.needsConfirmation) {
      setPendingDelete(scope);
      return;
    }
    editing.deleteElements(selectedNodeIds, selectedEdgeIds);
  }, [editing, selectedEdgeIds, selectedNodeIds]);

  const confirmDelete = useCallback(() => {
    setPendingDelete(null);
    editing.deleteElements(selectedNodeIds, selectedEdgeIds);
  }, [editing, selectedEdgeIds, selectedNodeIds]);

  // ---------------------------------------------------------------------------
  // Connecting
  // ---------------------------------------------------------------------------

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const reason = editing.connect({
        source: connection.source,
        target: connection.target,
        targetHandle: connection.targetHandle,
      });
      if (reason) say(reason);
    },
    [editing, say],
  );

  const isValidConnection = useCallback(
    (connection: Connection) =>
      Boolean(
        connection.source &&
        connection.target &&
        editing.canDrop({
          source: connection.source,
          target: connection.target,
          targetHandle: connection.targetHandle,
        }),
      ),
    [editing],
  );

  // ---------------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------------

  const fitToNodes = useCallback(
    (nodeIds: string[]) => {
      const wanted = new Set(nodeIds);
      // `fitView` wants nodes, not ids, and silently frames *everything* if
      // handed an empty list — which is the opposite of what a caller asking
      // for a specific set wants, so an empty match moves nothing.
      const targets = getNodes().filter((node) => wanted.has(node.id));
      if (targets.length === 0) return;
      fitView({ ...FIT_VIEW_OPTIONS, nodes: targets });
    },
    [fitView, getNodes],
  );

  const zoomToSelection = useCallback(() => {
    const selected = getNodes().filter((node) => node.selected);
    if (selected.length === 0) return false;
    fitView({ ...FIT_VIEW_OPTIONS, nodes: selected });
    return true;
  }, [fitView, getNodes]);

  // Click-to-jump (#21). `pannable` only buys *dragging* the minimap; a
  // click does nothing until it's wired, and clicking where you want to be
  // is the whole reason an overview map earns its corner of the screen.
  const jumpToMinimapPoint = useCallback(
    (_event: ReactMouseEvent, position: XYPosition) => {
      // Same zoom, new centre: a jump is a change of *place*, and having it
      // also change scale would lose the director's place twice over.
      setCenter(position.x, position.y, { zoom: getZoom(), duration: 200 });
    },
    [getZoom, setCenter],
  );

  useImperativeHandle(
    ref,
    () => ({ fitToNodes, zoomToSelection, fitToGraph: () => fitView(FIT_VIEW_OPTIONS) }),
    [fitToNodes, fitView, zoomToSelection],
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
        "fit-graph": () => fitView(FIT_VIEW_OPTIONS),
        "zoom-to-selection": () => {
          if (!zoomToSelection()) fitView(FIT_VIEW_OPTIONS);
        },
        deselect,
      }),
      [deselect, fitView, renameSelected, requestDelete, selectAll, zoomToSelection],
    ),
  );

  const paletteCommands = useMemo<PaletteCommand[]>(() => {
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
      ...CREATABLE_KINDS.map((kind) => ({
        id: `create-${kind}`,
        label: `Create ${NODE_KIND_META[kind].label}`,
        scope: "canvas" as const,
        icon: NODE_KIND_META[kind].icon,
        run: () => create(kind, centreOfView()),
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
        run: () => fitView(FIT_VIEW_OPTIONS),
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
    renameSelected,
    requestDelete,
    selectAll,
    selectedEdgeIds.length,
    selectedNodes,
    zoomToSelection,
  ]);

  const interaction = useMemo(
    () => ({
      renaming: editing.renaming,
      beginRename: editing.beginRename,
      renameTo: editing.renameTo,
      commitRename: editing.commitRename,
      cancelRename: editing.cancelRename,
      connecting: editing.connecting,
      targets: editing.targets,
    }),
    [editing],
  );

  return (
    <NodeInteractionProvider value={interaction}>
      {/* `mechane-show-graph` is what ./show-graph-editor.css hangs its
          overrides off, so they can't leak into another React Flow instance. */}
      <div className={cn("mechane-show-graph relative h-full w-full bg-background", className)}>
        <ContextMenu>
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
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              // The three halves of the drag gesture: open it, feed it each
              // frame, and land the whole thing as one undo entry (#28).
              onNodeDragStart={beginDrag}
              onNodeDrag={(_event, _node, moved) => dragTo(moved)}
              onNodeDragStop={endDrag}
              onConnectStart={(_event, { nodeId }) => nodeId && editing.beginConnect(nodeId)}
              onConnectEnd={editing.endConnect}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
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
              fitView
              fitViewOptions={FIT_VIEW_OPTIONS}
              proOptions={{ hideAttribution: true }}
              aria-label="Show graph"
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} />

              {/* Both restyled in ./show-graph-editor.css — React Flow ships
                  them with hardcoded near-white chrome. */}
              <Controls fitViewOptions={FIT_VIEW_OPTIONS} />
              <MiniMap
                pannable
                zoomable
                onClick={jumpToMinimapPoint}
                ariaLabel="Show graph minimap"
              />
            </ReactFlow>
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
                {CREATABLE_KINDS.map((kind) => {
                  const meta = NODE_KIND_META[kind];
                  const Icon = meta.icon;
                  return (
                    <ContextMenuItem key={kind} onClick={() => create(kind, menuPosition.current)}>
                      <Icon /> {meta.label}
                    </ContextMenuItem>
                  );
                })}
              </ContextMenuSubmenuContent>
            </ContextMenuSubmenu>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => fitView(FIT_VIEW_OPTIONS)}>
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

        {/* Floats over the canvas rather than taking layout from it, so the
            graph doesn't reflow when a selection appears. */}
        <div className="pointer-events-none absolute inset-y-4 right-4 flex max-h-full flex-col items-end">
          <GraphInspector selected={selectedNodes} editing={editing} className="max-h-full" />
        </div>

        {message ? (
          <p
            role="status"
            aria-live="polite"
            className="absolute inset-x-0 bottom-6 mx-auto w-fit rounded-full border border-border bg-card px-4 py-1.5 text-sm text-card-foreground shadow-lg"
          >
            {message}
          </p>
        ) : null}

        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          commands={paletteCommands}
        />

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
      </div>
    </NodeInteractionProvider>
  );
}

/**
 * One frame of a drag, as one command: moving three selected nodes together is
 * one entry in the gesture rather than three, which keeps the undo entry a
 * description of the gesture rather than of its parts (#28, #36).
 */
function moveComposite(moved: { id: string; position: Position }[]) {
  return composite({
    label: "Move",
    // A child's React Flow position is relative to its Flow, which is already
    // how the domain stores it (#29) — no conversion needed.
    commands: moved.map((node) => moveNode(node.id, node.position)),
  });
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
