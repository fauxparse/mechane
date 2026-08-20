// Every graph edit the Show editor can make, as commands (issue #42).
//
// This is the layer between "the user did something" and the Command stack
// (#41): it owns nothing about React Flow and nothing about the DOM, so the
// rules that matter — a rename is one gesture, a delete is one entry however
// wide the cascade, a connection is refused with a reason — are decided in one
// place rather than inside event handlers.
//
// Everything routes through `useGraphCommands`, so everything is undoable, and
// everything reaches the server by the same path an undo does (ADR-0005).
import {
  addEdge,
  addNode,
  composite,
  reparentNode,
  createFlowWithNodes,
  addSceneVariable,
  deleteGraphElements,
  deletionScope,
  removeSceneVariable,
  renameNode,
  renameSceneVariable,
  setFlowColor,
  moveNodesIntoFlow,
  moveNodesOutOfFlow,
} from "@mechane/commands";
import type { GraphEdit, Gesture } from "@mechane/commands";
import {
  connectionEdge,
  connectionError,
  connectionTargets,
  deviceSourceType,
  generateId,
} from "@mechane/domain";
import type {
  ConnectionTargets,
  FlowColor,
  GraphNode,
  NodeKind,
  Position,
  ShowGraph,
  Type,
} from "@mechane/domain";
import { useCallback, useMemo, useRef, useState } from "react";
import { sourceLabelFor } from "../graph/source-label";

import { INPUT_HANDLE, OUTPUT_HANDLE } from "../graph/graph-to-flow";
import { createNode } from "../graph/node-kinds";
import { useGraphCommands } from "./use-graph-commands";
import type { GraphCommands } from "./use-graph-commands";
import type { ApiGraph } from "../data/api-graph";

/** A drag from one node's handle to another's, as React Flow reports it. */
export interface ConnectionAttempt {
  source: string;
  target: string;
  /** The source handle, including a Device's virtual value handle. */
  sourceHandle?: string | null;
  /** The handle dropped on: a Variable id for wiring, `in` otherwise. */
  targetHandle?: string | null;
}

export interface GraphEditing {
  commands: GraphCommands;
  graph: ShowGraph;
  /** Applies server-side amendments to the graph, off the undo stack (#111). */
  amend(edits: readonly GraphEdit[]): void;

  /** Creates a node of `kind` at `position` (flow coordinates), and returns it. */
  createNodeOfKind(
    kind: NodeKind,
    position: Position,
    parentId?: string | null,
    options?: { perConnection?: boolean; defaultName?: string; sourceType?: Type },
  ): GraphNode;
  createFlowWithNodes(nodeIds: string[], position: Position, childOrigin: Position): GraphNode;
  /** Creates a typed Source or Device and connects it to a dropped source handle. */
  createNodeFromConnection(sourceId: string, sourceHandle: string, position: Position): void;

  /** The node being renamed inline, if any. */
  renaming: string | null;
  beginRename(nodeId: string): void;
  renameTo(name: string): void;
  commitRename(): void;
  cancelRename(): void;

  /** Deletes nodes and edges as one entry, cascade included (#27, #28, #36). */
  deleteElements(nodeIds: string[], edgeIds?: string[]): void;
  /** What a delete would destroy, for the confirmation dialog (#27). */
  scopeOf(nodeIds: string[], edgeIds?: string[]): ReturnType<typeof deletionScope>;

  /** True while a connection is being dragged from a handle. */
  connecting: boolean;
  /** What the in-flight drag may land on, or null when idle. */
  targets: ConnectionTargets | null;
  beginConnect(sourceId: string, sourceHandle?: string | null): void;
  endConnect(): void;
  /** Whether React Flow should let this connection be dropped. */
  canDrop(attempt: ConnectionAttempt): boolean;
  /** Makes the connection, or returns why it can't be made. */
  connect(attempt: ConnectionAttempt): string | null;

  addVariable(sceneId: string): void;
  renameVariable(sceneId: string, variableId: string, name: string): void;
  removeVariable(sceneId: string, variableId: string): void;
  /** Structural Flow moves; collapse is intentionally not part of this API. */
  moveIntoFlow(nodeIds: string[], flowId: string, origin: Position): void;
  moveOutOfFlow(nodeIds: string[], positions: Position[]): string | null;
  setFlowColor(flowId: string, color: FlowColor): void;
}

/**
 * The editing surface over a Show's graph.
 *
 * `save` is called with the edits every landed command produced — including
 * the ones an undo produces, since an undo is an ordinary forward command
 * (ADR-0005) with edits of its own (#103). It's the caller's job to debounce
 * or batch; this hook just reports.
 */
export function useGraphEditing(
  source: ApiGraph | null | undefined,
  save?: (edits: readonly GraphEdit[], graph: ShowGraph) => void,
): GraphEditing {
  const commands = useGraphCommands(source, save);
  const { graph, execute, beginGesture } = commands;
  const [renaming, setRenaming] = useState<string | null>(null);
  const renamingNode = useRef<string | null>(null);
  const rename = useRef<Gesture<ShowGraph, GraphEdit> | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{
    nodeId: string;
    sourceHandle: string | null;
  } | null>(null);
  // Computed once when the drag starts, not per hover: the answer is about the
  // whole graph (#35's affordance dims every non-target), and recomputing it on
  // pointer move would be the same answer at a cost.
  const targets = useMemo(
    () =>
      connectingFrom
        ? connectionTargets(graph, connectingFrom.nodeId, connectingFrom.sourceHandle)
        : null,
    [connectingFrom, graph],
  );
  const createNodeOfKind = useCallback(
    (
      kind: NodeKind,
      position: Position,
      parentId: string | null = null,
      options: { perConnection?: boolean; defaultName?: string; sourceType?: Type } = {},
    ) => {
      const node = createNode(kind, position, parentId, options);
      execute(addNode(node, `Add ${kind}`));
      return node;
    },
    [execute],
  );
  const createNodeFromConnection = useCallback(
    (sourceId: string, sourceHandle: string, position: Position) => {
      const producer = graph.nodes.find((node) => node.id === sourceId);
      const sourceType =
        producer?.kind === "device"
          ? deviceSourceType(sourceHandle)
          : producer?.kind === "source" || producer?.kind === "transformer"
            ? producer.type
            : null;
      const node =
        producer?.kind === "flow" && sourceHandle === OUTPUT_HANDLE
          ? createNode("device", position)
          : sourceType
            ? createNode("source", position, null, {
                sourceType,
                defaultName: sourceLabelFor(graph, sourceId, sourceHandle),
              })
            : null;
      if (!node) return;

      const graphWithNode = { ...graph, nodes: [...graph.nodes, node] };
      const edge = connectionEdge(
        graphWithNode,
        { sourceId, sourceHandle, targetId: node.id },
        generateId("edge"),
      );
      if (!edge) return;
      execute(
        composite({
          label: node.kind === "device" ? "Create Device" : "Create Source",
          commands: [addNode(node, `Create ${node.kind}`), addEdge(edge, "Connect")],
        }),
      );
    },
    [execute, graph],
  );

  const createFlowWithSelection = useCallback(
    (nodeIds: string[], position: Position, childOrigin: Position) => {
      const flow = createNode("flow", position);
      execute(createFlowWithNodes(graph, flow, nodeIds, childOrigin));
      return flow;
    },
    [execute, graph],
  );

  // Renaming is a gesture, so N keystrokes are one undo entry (#28). The
  // gesture is opened lazily on the first keystroke: opening it on
  // double-click would mean an empty gesture for every rename the user thinks
  // better of.
  const beginRename = useCallback((nodeId: string) => {
    rename.current = null;
    renamingNode.current = nodeId;
    setRenaming(nodeId);
  }, []);

  const renameTo = useCallback(
    (name: string) => {
      const nodeId = renamingNode.current;
      if (!nodeId) return;
      rename.current ??= beginGesture({ key: `rename:${nodeId}`, label: "Rename" });
      rename.current.update(renameNode(nodeId, name));
    },
    [beginGesture],
  );

  const commitRename = useCallback(() => {
    rename.current?.commit();
    rename.current = null;
    renamingNode.current = null;
    setRenaming(null);
  }, []);

  // Escape abandons the gesture, which rolls the name back to what it was —
  // the same mechanism a cancelled drag uses, rather than a remembered
  // "original name" this hook would have to keep in step.
  const cancelRename = useCallback(() => {
    rename.current?.abort();
    rename.current = null;
    renamingNode.current = null;
    setRenaming(null);
  }, []);

  const scopeOf = useCallback(
    (nodeIds: string[], edgeIds: string[] = []) => deletionScope(graph, nodeIds, edgeIds),
    [graph],
  );

  const deleteElements = useCallback(
    (nodeIds: string[], edgeIds: string[] = []) => {
      if (nodeIds.length === 0 && edgeIds.length === 0) return;
      execute(deleteGraphElements(graph, nodeIds, edgeIds));
    },
    [execute, graph],
  );

  const beginConnect = useCallback(
    (sourceId: string, sourceHandle: string | null = null) =>
      setConnectingFrom({ nodeId: sourceId, sourceHandle }),
    [],
  );
  const endConnect = useCallback(() => setConnectingFrom(null), []);

  const requestOf = useCallback(
    (attempt: ConnectionAttempt) => ({
      sourceId: attempt.source,
      targetId: attempt.target,
      sourceHandle: attempt.sourceHandle,
      targetHandle: attempt.targetHandle,
      // React Flow reports the handle that was dropped; a Variable's handle
      // *is* its id (see ./graph-to-flow), so a wiring drop identifies the
      // Variable and a node-level drop reports the node's own handle instead.
      targetVariableId: variableHandle(attempt.targetHandle),
    }),
    [],
  );

  const canDrop = useCallback(
    (attempt: ConnectionAttempt) => connectionError(graph, requestOf(attempt)) === null,
    [graph, requestOf],
  );

  const connect = useCallback(
    (attempt: ConnectionAttempt) => {
      const request = requestOf(attempt);
      const reason = connectionError(graph, request);
      if (reason) return reason;
      const edge = connectionEdge(graph, request, generateId("edge"));
      if (!edge) return "That connection can't be made.";
      const producer = graph.nodes.find((node) => node.id === request.sourceId);
      const consumer = graph.nodes.find((node) => node.id === request.targetId);
      if (
        producer?.parentId !== null &&
        producer?.parentId !== undefined &&
        consumer?.kind === "transformer" &&
        consumer.parentId === null
      ) {
        execute(
          composite({
            label: "Connect",
            commands: [
              reparentNode(consumer.id, producer.parentId, consumer.position),
              addEdge(edge, "Connect"),
            ],
          }),
        );
      } else {
        execute(addEdge(edge, "Connect"));
      }
      return null;
    },
    [execute, graph, requestOf],
  );

  const addVariable = useCallback(
    (sceneId: string) => {
      const scene = graph.nodes.find((node) => node.id === sceneId);
      const taken = scene?.kind === "scene" ? scene.variables.length : 0;
      execute(
        addSceneVariable(sceneId, {
          id: generateId("variable"),
          // Variable names are unique per Scene (#38 enforces it), so the
          // default counts up rather than colliding on "variable".
          name: `variable${taken + 1}`,
        }),
      );
    },
    [execute, graph],
  );

  const renameVariable = useCallback(
    (sceneId: string, variableId: string, name: string) => {
      const gesture = beginGesture({ key: `rename:${variableId}`, label: "Rename Variable" });
      gesture.update(renameSceneVariable(sceneId, variableId, name));
    },
    [beginGesture],
  );

  const removeVariable = useCallback(
    (sceneId: string, variableId: string) => {
      execute(removeSceneVariable(sceneId, variableId));
    },
    [execute],
  );

  const changeFlowColor = useCallback(
    (flowId: string, color: FlowColor) => {
      execute(setFlowColor(flowId, color));
    },
    [execute],
  );

  const moveIntoFlow = useCallback(
    (nodeIds: string[], flowId: string, origin: Position) => {
      execute(moveNodesIntoFlow(graph, nodeIds, flowId, origin));
    },
    [execute, graph],
  );

  const moveOutOfFlow = useCallback(
    (nodeIds: string[], positions: Position[]) => {
      try {
        execute(moveNodesOutOfFlow(graph, nodeIds, positions));
        return null;
      } catch (error) {
        return error instanceof Error
          ? error.message
          : "Those nodes cannot be moved out of their Flow.";
      }
    },
    [execute, graph],
  );

  return {
    commands,
    graph,
    amend: commands.amend,
    createNodeOfKind,
    createNodeFromConnection,
    createFlowWithNodes: createFlowWithSelection,
    renaming,
    beginRename,
    renameTo,
    commitRename,
    cancelRename,
    deleteElements,
    scopeOf,
    connecting: connectingFrom !== null,
    targets,
    setFlowColor: changeFlowColor,
    beginConnect,
    endConnect,
    canDrop,
    connect,
    addVariable,
    renameVariable,
    removeVariable,
    moveIntoFlow,
    moveOutOfFlow,
  };
}

/** The Variable a drop landed on, or null if it landed on a node-level handle. */
function variableHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  return handle === INPUT_HANDLE || handle === OUTPUT_HANDLE ? null : handle;
}
