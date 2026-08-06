// The Show editor's graph surface (issue #40, spec'd by #21): a React Flow
// instance with viewport navigation complete — drag/scroll/keyboard pan,
// zoom from 0.1 to 2, restyled Controls, and a click-to-jump minimap.
//
// This slice is the camera, not the content: node bodies are placeholders
// (see ./ShowGraphNodes) and nothing here mutates the graph server-side.
//
// Decisions worth not re-litigating (#21):
//
//   - `minZoom: 0.1` is widened from React Flow's 0.5 floor, so a director
//     can pull back far enough to see a whole Show at once. That's the
//     "big flowchart overview" the editor exists for.
//   - `<Controls/>` and `<MiniMap/>` are React Flow's own, restyled — a
//     visual override, not a rebuild. They ship hardcoded white chrome and
//     are unreadable on a dark background until overridden (found by the #35
//     prototype), so ./show-graph-editor.css is load-bearing, not polish.
//   - Drag pans, Shift+drag box-selects: React Flow's default, kept.
//
// Node positions are session-local: dragging a node moves it and lands an
// undo entry, but nothing is saved server-side — the mutation surface belongs
// to the CRUD slice (#42), which attaches to the `dispatch` seam on the
// command stack. Nodes stay draggable regardless: "a focused node moves
// itself with the arrows" (PRD §6.3) is exactly what the pan rule defers to.
//
// Every position change goes through a Command (issue #41) rather than
// straight into React Flow's state, which is what makes Cmd+Z work here at
// all — and a whole drag is *one* entry, not one per frame (#28), because the
// drag runs inside a gesture that only lands when the mouse comes up.
import { composite, moveNode } from "@presence/commands";
import type { Gesture } from "@presence/commands";
import { cn } from "@presence/design-system";
import type { ShowGraph } from "@presence/domain";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { MouseEvent as ReactMouseEvent, Ref } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "reactflow";
import type { FitViewOptions, XYPosition } from "reactflow";

import "reactflow/dist/style.css";
import "./show-graph-editor.css";

import type { ApiGraph } from "./api-graph";
import { FLOW_NODE_TYPE, graphToFlow, PLACEHOLDER_NODE_TYPE } from "./graph-to-flow";
import type { ShowFlowNode } from "./graph-to-flow";
import { ShowFlowNode as FlowNodeBody, ShowNode } from "./ShowGraphNodes";
import { useGraphCommands } from "./use-graph-commands";
import { useUndoKeys } from "./use-undo-keys";
import { useViewportKeys } from "./use-viewport-keys";

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

/**
 * The imperative camera moves the editor exposes to whatever ends up
 * triggering them. Zoom-to-selection is a *capability* here on purpose: its
 * keybinding waits on the selection model (#36) and the shortcut map (#37),
 * so #40 lands the ability and not the trigger.
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
  className?: string;
  ref?: Ref<ShowGraphEditorHandle>;
}

function ShowGraphEditorInner({ graph, className, ref }: ShowGraphEditorProps) {
  // The editable graph and its undo history. Everything drawn below is
  // derived from `commands.graph`, so an undo redraws for the same reason an
  // edit does — there's one source of truth, not two that have to agree.
  const commands = useGraphCommands(graph);
  const drawn = useMemo(() => graphToFlow(commands.graph), [commands.graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(drawn.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(drawn.edges);
  const { fitView, getNodes, getZoom, setCenter } = useReactFlow();

  useViewportKeys();
  useUndoKeys(commands);

  // React Flow owns the *interaction* state — which nodes are selected, which
  // is mid-drag — and it lives on the same objects as the positions, so a
  // redraw has to carry it across or clicking a node would deselect it.
  const dragging = useRef(false);
  useEffect(() => {
    // While a drag is in flight React Flow is already showing the right
    // positions, frame by frame; replacing its nodes underneath it would
    // interrupt the very gesture that's producing them.
    if (dragging.current) return;
    setNodes((previous) => {
      const interaction = new Map(previous.map((node) => [node.id, node]));
      return drawn.nodes.map((node) => {
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

  // One gesture per drag, so N frames of movement are one undo entry (#28).
  // React Flow hands over every node the drag is moving, which is what makes
  // dragging a multi-node selection one entry too, rather than one per node.
  const { beginGesture } = commands;
  const drag = useRef<Gesture<ShowGraph> | null>(null);

  const beginDrag = useCallback(() => {
    dragging.current = true;
    drag.current = beginGesture({ key: "drag", label: "Move" });
  }, [beginGesture]);

  const dragTo = useCallback((moved: ShowFlowNode[]) => {
    drag.current?.update(
      composite({
        label: "Move",
        // A child's React Flow position is relative to its Flow, which is
        // already how the domain stores it (#29) — no conversion needed.
        commands: moved.map((node) => moveNode(node.id, node.position)),
      }),
    );
  }, []);

  const endDrag = useCallback(
    (_event: ReactMouseEvent, _node: ShowFlowNode, moved: ShowFlowNode[]) => {
      // The final position comes from the stop event: React Flow doesn't
      // guarantee a last `onNodeDrag` at the position the mouse came up at.
      dragTo(moved);
      dragging.current = false;
      drag.current?.commit();
      drag.current = null;
    },
    [dragTo],
  );

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
    () => ({
      fitToNodes,
      zoomToSelection: () => {
        const selected = getNodes().filter((node) => node.selected);
        if (selected.length === 0) return false;
        fitView({ ...FIT_VIEW_OPTIONS, nodes: selected });
        return true;
      },
      fitToGraph: () => fitView(FIT_VIEW_OPTIONS),
    }),
    [fitToNodes, fitView, getNodes],
  );

  return (
    // `presence-show-graph` is what ./show-graph-editor.css hangs its
    // overrides off, so they can't leak into another React Flow instance.
    <div className={cn("presence-show-graph h-full w-full bg-background", className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        // The three halves of the drag gesture: open it, feed it each frame,
        // and land the whole thing as one undo entry on mouse-up (#28).
        onNodeDragStart={beginDrag}
        onNodeDrag={(_event, _node, moved) => dragTo(moved)}
        onNodeDragStop={endDrag}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        // Edge creation is the one accepted keyboard exception (PRD §6.3),
        // and the slice that makes edges at all is still ahead — so the
        // handles are decoration for now and connecting is off.
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        aria-label="Show graph"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />

        {/* Both restyled in ./show-graph-editor.css — React Flow ships them
            with hardcoded near-white chrome, unreadable on a dark background. */}
        <Controls fitViewOptions={FIT_VIEW_OPTIONS} />
        <MiniMap pannable zoomable onClick={jumpToMinimapPoint} ariaLabel="Show graph minimap" />
      </ReactFlow>
    </div>
  );
}

/**
 * Renders a Show's graph. Wraps its own `<ReactFlowProvider>` so the
 * imperative viewport API is available to the keyboard hook and to the
 * handle above — the route doesn't have to know React Flow needs one.
 */
export function ShowGraphEditor(props: ShowGraphEditorProps) {
  return (
    <ReactFlowProvider>
      <ShowGraphEditorInner {...props} />
    </ReactFlowProvider>
  );
}

export type { ShowFlowNode };
