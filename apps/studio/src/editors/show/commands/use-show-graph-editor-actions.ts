import { composite, moveNode, moveNodesIntoFlow, moveNodesOutOfFlow } from "@mechane/commands";
import type { GraphNode, Position, ShowGraph } from "@mechane/domain";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Connection, FitViewOptions, OnNodeDrag, XYPosition } from "@xyflow/react";
import type { MouseEvent as ReactMouseEvent } from "react";

import {
  absolutePosition,
  FLOW_CONTENT_ORIGIN,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "../graph/graph-to-flow";
import type { ShowFlowNode } from "../graph/graph-to-flow";
import {
  clampIntoFlow,
  clearOfFlows,
  compactRootScenePair,
  flowAtPoint,
  nextChildPosition,
  relativeToFlow,
  sizeOf,
  type CreationSite,
  type Size,
} from "../show-graph-layout";
import { createNode, type CreatableNode } from "../graph/node-kinds";
import type { DeletionScope } from "@mechane/commands";
import { readHandle } from "../graph/handle-ids";
import { useCallback, useMemo, useRef } from "react";

function moveComposite(moved: { id: string; position: Position }[]) {
  return composite({
    label: "Move",
    // A child's React Flow position is relative to its Flow, which is already
    // how the domain stores it (#29) — no conversion needed.
    commands: moved.map((node) => moveNode(node.id, node.position)),
  });
}

/**
 * The nodes a finished drag may reparent, or null when it may not.
 *
 * Flows and Devices are always Show-level peers (#23, #26), so dragging one
 * over a Flow means nothing. A mixed-scope selection is refused for the same
 * reason `dragTo` refuses it: React Flow pins nested children to their Flow,
 * so the selection was never moving as one thing to begin with.
 */
function reparentableDrag(
  dragged: ShowFlowNode,
  moved: readonly ShowFlowNode[],
): { nodeIds: string[]; currentFlowId: string | null } | null {
  if (moved.length === 0) return null;
  if (moved.some((node) => node.data.kind === "flow" || node.data.kind === "device")) return null;
  const currentFlowId = dragged.parentId ?? null;
  if (moved.some((node) => (node.parentId ?? null) !== currentFlowId)) return null;
  return { nodeIds: moved.map((node) => node.id), currentFlowId };
}

/**
 * The Flow a create command should put its node in, and where inside it.
 *
 * A point knows exactly where it landed, so it keeps that spot. The palette
 * has only the selection: a selected Flow means "in there", and a selected
 * node means "beside it, in whatever holds it".
 */
function hostFlowFor(
  site: CreationSite,
  rendered: readonly ShowFlowNode[],
  byId: ReadonlyMap<string, ShowFlowNode>,
  selectedNodes: readonly GraphNode[],
): { flow: ShowFlowNode; preferred?: Position } | null {
  if (site.from === "point") {
    const flow = flowAtPoint(site.at, rendered);
    return flow ? { flow, preferred: relativeToFlow(site.at, flow, byId) } : null;
  }
  const selectedFlow = selectedNodes.find((node) => node.kind === "flow");
  if (selectedFlow) {
    const flow = byId.get(selectedFlow.id);
    return flow ? { flow } : null;
  }
  const parentIds = new Set(selectedNodes.map((node) => node.parentId));
  const [only] = [...parentIds];
  const flow = parentIds.size === 1 && only ? byId.get(only) : undefined;
  return flow ? { flow } : null;
}

import type {
  GraphConnectionEditing,
  GraphCreationEditing,
  GraphDeletionEditing,
} from "./use-graph-editing";
import type { GraphCommands } from "./use-graph-commands";

interface Options {
  graph: ShowGraph;
  commands: GraphCommands;
  creation: GraphCreationEditing;
  deletion: GraphDeletionEditing;
  connections: GraphConnectionEditing;
  selectedNodes: GraphNode[];
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  getNodes: ReturnType<typeof import("@xyflow/react").useReactFlow>["getNodes"];
  getZoom: ReturnType<typeof import("@xyflow/react").useReactFlow>["getZoom"];
  setCenter: ReturnType<typeof import("@xyflow/react").useReactFlow>["setCenter"];
  fitView: ReturnType<typeof import("@xyflow/react").useReactFlow>["fitView"];
  /** Inset-aware framing options, decided once in ../graph/use-fit-view-options. */
  fitViewOptions: FitViewOptions;
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
  graph,
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
}: Options) {
  const editing = useMemo(
    () => ({ graph, ...creation, ...deletion, ...connections }),
    [connections, creation, deletion, graph],
  );
  const { beginGesture } = commands;
  /** The rendered graph, and the lookup every geometry helper here needs. */
  const renderedGraph = useCallback(() => {
    const rendered = getNodes() as ShowFlowNode[];
    return { rendered, byId: new Map(rendered.map((node) => [node.id, node])) };
  }, [getNodes]);

  // ---------------------------------------------------------------------------
  // Moving
  // ---------------------------------------------------------------------------

  const dragGesture = useRef<ReturnType<typeof beginGesture> | null>(null);

  const beginDrag: OnNodeDrag<ShowFlowNode> = useCallback(
    (_event, _node, _moved) => {
      dragging.current = true;
      dragGesture.current = beginGesture({ key: "drag", label: "Move" });
    },
    [beginGesture, dragGesture, dragging],
  );

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

  /**
   * A drag ends by deciding where the dragged nodes now live (#508).
   *
   * The Flow under the *dragged* node's box is the answer — the selection
   * travels with it, because `dragTo` has already refused a mixed-scope drag.
   * Landing in a different Flow is one move, not an extraction the director
   * has to do first, and anything that lands in a Flow is clamped inside its
   * box: containment is placement (#29), so a node half outside its Flow
   * would be lying about where it belongs.
   */
  const endDrag: OnNodeDrag<ShowFlowNode> = useCallback(
    (_event, dragged, moved: ShowFlowNode[]) => {
      dragTo(moved);
      const gesture = dragGesture.current;
      dragging.current = false;
      dragGesture.current = null;
      if (!gesture) return;

      const { rendered, byId: renderedById } = renderedGraph();
      // `moved` carries the positions the drag actually finished at; the
      // rendered map supplies everything else, the parent Flows included.
      const byId = new Map(renderedById);
      for (const node of moved) byId.set(node.id, node);
      const reparenting = reparentableDrag(dragged, moved);
      if (!reparenting) {
        gesture.commit();
        return;
      }

      const { nodeIds, currentFlowId } = reparenting;
      const anchor = absolutePosition(dragged, byId);
      const targetFlow = flowAtPoint(anchor, rendered, new Set(nodeIds));
      const targetFlowId = targetFlow?.id ?? null;

      try {
        if (targetFlow) {
          // Every node lands inside the box, including the ones that came
          // along for the ride — the gesture's last update is the whole move,
          // so it has to name all of them.
          const inside = nodeIds.map((nodeId) => {
            const node = byId.get(nodeId);
            const at = node ? absolutePosition(node, byId) : anchor;
            return {
              id: nodeId,
              position: clampIntoFlow(
                targetFlow,
                relativeToFlow(at, targetFlow, byId),
                sizeOf(node ?? dragged),
              ),
            };
          });
          const origin =
            inside.find((placed) => placed.id === dragged.id)?.position ?? inside[0]!.position;
          gesture.update(
            targetFlowId === currentFlowId
              ? moveComposite(inside)
              : moveNodesIntoFlow(editing.graph, nodeIds, targetFlow.id, origin),
          );
        } else if (currentFlowId !== null) {
          gesture.update(
            moveNodesOutOfFlow(
              editing.graph,
              nodeIds,
              nodeIds.map((nodeId) => {
                const node = byId.get(nodeId);
                return node ? absolutePosition(node, byId) : anchor;
              }),
            ),
          );
        }
        gesture.commit();
      } catch (error) {
        gesture.abort();
        say(
          error instanceof Error ? error.message : "Those nodes cannot be moved out of their Flow.",
        );
      }
    },
    [dragTo, dragGesture, dragging, editing, renderedGraph, say],
  );

  // ---------------------------------------------------------------------------
  // Creating
  // ---------------------------------------------------------------------------

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

  /**
   * Where a new node goes, decided by how the create command was invoked
   * (#508). A right-click knows a point, so it joins the Flow under that
   * point; the palette knows only the selection, so it joins the selected
   * Flow — or the one holding the selection — and lands in a free row.
   *
   * The two rules underneath are absolute: a Flow-owned node is inside its
   * Flow's box, and a Show-level node is inside nobody's. Flows and Devices
   * are always Show-level peers (#23, #26), so they are only ever placed
   * clear of every Flow, however the command was invoked.
   */
  const create = useCallback(
    (creatable: CreatableNode, site: CreationSite) => {
      const { kind } = creatable;
      const { rendered, byId } = renderedGraph();
      const size: Size = { width: NODE_WIDTH, height: NODE_HEIGHT };
      const pointOf = (): Position => (site.from === "point" ? site.at : centreOfView());

      // Creating a Flow over the current selection is one command: create the
      // container, then move eligible top-level content into it.
      if (kind === "flow") {
        const nodeIds = selectedNodes.reduce<string[]>((ids, node) => {
          if (node.parentId === null && node.kind !== "device" && node.kind !== "flow") {
            ids.push(node.id);
          }
          return ids;
        }, []);
        const node = editing.createFlowWithNodes(
          nodeIds,
          clearOfFlows(pointOf(), size, rendered),
          FLOW_CONTENT_ORIGIN,
        );
        selectOnArrival.current = node.id;
        focusOnArrival.current = node.id;
        return node;
      }

      const host = kind === "device" ? null : hostFlowFor(site, rendered, byId, selectedNodes);
      const position = host
        ? host.preferred
          ? clampIntoFlow(host.flow, host.preferred, size)
          : nextChildPosition(
              host.flow,
              rendered.filter((node) => node.parentId === host.flow.id),
              size,
            )
        : clearOfFlows(pointOf(), size, rendered);
      // A freshly created node becomes the selection, so the inspector opens on
      // it and F2 renames it without a click first.
      const node = editing.createNodeOfKind(kind, position, host?.flow.id ?? null, {
        perConnection: creatable.perConnection,
        defaultName: creatable.defaultName,
      });
      selectOnArrival.current = node.id;
      return node;
    },
    [centreOfView, editing, focusOnArrival, renderedGraph, selectOnArrival, selectedNodes],
  );

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
      const attempt = {
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
      };
      const sourceHandle = connection.sourceHandle ? readHandle(connection.sourceHandle) : null;
      const targetHandle = connection.targetHandle ? readHandle(connection.targetHandle) : null;
      const source = graph.nodes.find((node) => node.id === connection.source);
      const target = graph.nodes.find((node) => node.id === connection.target);
      let rootPlan:
        | {
            flow: Extract<GraphNode, { kind: "flow" }>;
            sourcePosition: Position;
            destinationPosition: Position;
            flowSize: { width: number; height: number };
          }
        | Record<string, never>
        | undefined;
      if (
        source?.kind === "scene" &&
        target?.kind === "scene" &&
        sourceHandle?.kind === "output" &&
        targetHandle?.kind === "input"
      ) {
        const rendered = getNodes() as ShowFlowNode[];
        const byId = new Map(rendered.map((node) => [node.id, node]));
        const renderedSource = byId.get(source.id);
        const renderedTarget = byId.get(target.id);
        if (!renderedSource || !renderedTarget) {
          say("Scene navigation is not ready yet.");
          return;
        }
        if (source.parentId === null && target.parentId === null) {
          const sourcePosition = absolutePosition(renderedSource, byId);
          const targetPosition = absolutePosition(renderedTarget, byId);
          const midpoint = {
            x:
              (sourcePosition.x +
                sizeOf(renderedSource).width / 2 +
                targetPosition.x +
                sizeOf(renderedTarget).width / 2) /
              2,
            y:
              (sourcePosition.y +
                sizeOf(renderedSource).height / 2 +
                targetPosition.y +
                sizeOf(renderedTarget).height / 2) /
              2,
          };
          const pair = compactRootScenePair(renderedSource, renderedTarget, midpoint, rendered);
          rootPlan = {
            flow: createNode("flow", pair.flowPosition) as Extract<GraphNode, { kind: "flow" }>,
            sourcePosition: pair.sourcePosition,
            destinationPosition: pair.destinationPosition,
            flowSize: pair.dimensions,
          };
        } else {
          rootPlan = {};
        }
      }
      const reason = editing.connect(attempt, rootPlan);
      if (reason) say(reason);
    },
    [editing, getNodes, graph.nodes, say],
  );

  const isValidConnection = useCallback(
    (connection: Connection) =>
      Boolean(
        connection.source &&
        connection.target &&
        editing.canDrop({
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle,
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
      fitView({ ...fitViewOptions, nodes: targets });
    },
    [fitView, fitViewOptions, getNodes],
  );

  const zoomToSelection = useCallback(() => {
    const selected = (getNodes() as ShowFlowNode[]).filter((node) => node.selected);
    if (selected.length === 0) return false;
    fitView({ ...fitViewOptions, nodes: selected });
    return true;
  }, [fitView, fitViewOptions, getNodes]);

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
