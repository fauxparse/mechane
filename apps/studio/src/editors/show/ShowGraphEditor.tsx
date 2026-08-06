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
// Node positions are local state: dragging a node moves it for this session
// and is not saved, because the graph-mutation slice hasn't landed. Nodes
// stay draggable anyway — a graph whose nodes are nailed down can't be used
// to judge the camera, and "a focused node moves itself with the arrows"
// (PRD §6.3) is exactly what the pan rule has to defer to.
import { cn } from "@presence/design-system";
import { useCallback, useEffect, useImperativeHandle, useMemo } from "react";
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

import { FLOW_NODE_TYPE, graphToFlow, PLACEHOLDER_NODE_TYPE } from "./graph-to-flow";
import type { ShowFlowNode } from "./graph-to-flow";
import { ShowFlowNode as FlowNodeBody, ShowNode } from "./ShowGraphNodes";
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
  /** The graph to draw, or null while it's still loading. */
  graph: Parameters<typeof graphToFlow>[0];
  className?: string;
  ref?: Ref<ShowGraphEditorHandle>;
}

function ShowGraphEditorInner({ graph, className, ref }: ShowGraphEditorProps) {
  const initial = useMemo(() => graphToFlow(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const { fitView, getNodes, getZoom, setCenter } = useReactFlow();

  useViewportKeys();

  // The graph arriving (or being refetched) replaces what's drawn. Local
  // drag positions are discarded with it — see the header note on why
  // they're local in the first place.
  useEffect(() => {
    setNodes(initial.nodes);
    setEdges(initial.edges);
  }, [initial, setNodes, setEdges]);

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
