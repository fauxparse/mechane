import { moveNode } from "@mechane/commands";
import type { GraphNode, NodeKind, Position } from "@mechane/domain";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Connection, FitViewOptions, OnNodeDrag, XYPosition } from "@xyflow/react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { absolutePosition, FLOW_CONTENT_ORIGIN, FLOW_NODE_TYPE, NODE_WIDTH } from "./graph-to-flow";
import type { ShowFlowNode } from "./graph-to-flow";
import { composite } from "@mechane/commands";
import { useCallback, useRef } from "react";
import type { DeletionScope } from "@mechane/commands";

function moveComposite(moved: { id: string; position: Position }[]) {
  return composite({
    label: "Move",
    // A child's React Flow position is relative to its Flow, which is already
    // how the domain stores it (#29) — no conversion needed.
    commands: moved.map((node) => moveNode(node.id, node.position)),
  });
}

const FIT_VIEW_OPTIONS: FitViewOptions = { padding: 0.2, maxZoom: 1, duration: 200 };

type Editing = ReturnType<typeof import("./use-graph-editing").useGraphEditing>;

interface Options {
  editing: Editing;
  commands: Editing["commands"];
  selectedNodes: GraphNode[];
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  getNodes: ReturnType<typeof import("@xyflow/react").useReactFlow>["getNodes"];
  getZoom: ReturnType<typeof import("@xyflow/react").useReactFlow>["getZoom"];
  setCenter: ReturnType<typeof import("@xyflow/react").useReactFlow>["setCenter"];
  fitView: ReturnType<typeof import("@xyflow/react").useReactFlow>["fitView"];
  screenToFlowPosition: ReturnType<
    typeof import("@xyflow/react").useReactFlow
  >["screenToFlowPosition"];
  say(text: string): void;
  setPendingDelete: Dispatch<SetStateAction<DeletionScope | null>>;
  dragging: MutableRefObject<boolean>;
  selectOnArrival: MutableRefObject<string | null>;
  focusOnArrival: MutableRefObject<string | null>;
}

export function useShowGraphEditorActions({
  editing,
  commands,
  selectedNodes,
  selectedNodeIds,
  selectedEdgeIds,
  getNodes,
  getZoom,
  setCenter,
  fitView,
  screenToFlowPosition,
  say,
  setPendingDelete,
  dragging,
  selectOnArrival,
  focusOnArrival,
}: Options) {
  const { beginGesture } = commands;
  // ---------------------------------------------------------------------------
  // Moving
  // ---------------------------------------------------------------------------

  const dragGesture = useRef<ReturnType<typeof beginGesture> | null>(null);

  const beginDrag = useCallback(() => {
    dragging.current = true;
    dragGesture.current = beginGesture({ key: "drag", label: "Move" });
  }, [beginGesture, dragGesture, dragging]);

  const dragTo = useCallback(
    (moved: ShowFlowNode[]) => {
      // A mixed-scope selection can't be dragged coherently (#36): React Flow
      // pins nested children to their Flow, so top-level members would move
      // freely while nested ones clamped, silently deforming the selection.
      const parents = new Set(moved.map((node) => node.parentId ?? null));
      if (parents.size > 1) return;
      dragGesture.current?.update(
        moveComposite(moved.map((node) => ({ id: node.id, position: node.position }))),
      );
    },
    [dragGesture],
  );

  const endDrag: OnNodeDrag<ShowFlowNode> = useCallback(
    (_event, _node, moved: ShowFlowNode[]) => {
      dragTo(moved);
      dragging.current = false;
      dragGesture.current?.commit();
      dragGesture.current = null;
    },
    [dragTo, dragGesture, dragging],
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
      (getNodes() as ShowFlowNode[]).find((node) => {
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
      // Creating a Flow over the current selection is one command: create the
      // container, then move eligible top-level content into it.
      if (kind === "flow") {
        const nodeIds = selectedNodes.reduce<string[]>((ids, node) => {
          if (node.parentId === null && node.kind !== "device" && node.kind !== "flow") {
            ids.push(node.id);
          }
          return ids;
        }, []);
        const node = editing.createFlowWithNodes(nodeIds, at, FLOW_CONTENT_ORIGIN);
        selectOnArrival.current = node.id;
        focusOnArrival.current = node.id;
        return node;
      }
      const flow = kind === "device" ? null : flowAt(at);
      // A nested node's position is relative to its Flow (#29), which is
      // exactly how React Flow reads it too.
      const position = flow ? { x: at.x - flow.position.x, y: at.y - flow.position.y } : at;
      // A freshly created node becomes the selection, so the inspector opens on
      // it and F2 renames it without a click first.
      const node = editing.createNodeOfKind(kind, position, flow?.id ?? null);
      selectOnArrival.current = node.id;
      return node;
    },
    [editing, flowAt, focusOnArrival, selectOnArrival, selectedNodes],
  );

  /** Where a palette-created node goes: near the selection, else viewport centre (#27). */
  const centreOfView = useCallback((): Position => {
    const rendered = getNodes() as ShowFlowNode[];
    const selected = rendered.filter((node) => node.selected);
    if (selected.length > 0) {
      const first = selected[0] as ShowFlowNode;
      const position = absolutePosition(first, new Map(rendered.map((node) => [node.id, node])));
      return { x: position.x + NODE_WIDTH + 48, y: position.y };
    }
    const bounds = document.querySelector(".mechane-show-graph")?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    // `screenToFlowPosition` reads screen coordinates, so the pane's own
    // origin goes back in — v11's `project` took them pane-relative.
    return screenToFlowPosition({
      x: bounds.left + bounds.width / 2 - NODE_WIDTH / 2,
      y: bounds.top + bounds.height / 2,
    });
  }, [getNodes, screenToFlowPosition]);

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
  }, [editing, selectedEdgeIds, selectedNodeIds, setPendingDelete]);

  const confirmDelete = useCallback(() => {
    setPendingDelete(null);
    editing.deleteElements(selectedNodeIds, selectedEdgeIds);
  }, [editing, selectedEdgeIds, selectedNodeIds, setPendingDelete]);

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
      const targets = (getNodes() as ShowFlowNode[]).filter((node) => wanted.has(node.id));
      if (targets.length === 0) return;
      fitView({ ...FIT_VIEW_OPTIONS, nodes: targets });
    },
    [fitView, getNodes],
  );

  const zoomToSelection = useCallback(() => {
    const selected = (getNodes() as ShowFlowNode[]).filter((node) => node.selected);
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

  return {
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
  };
}
