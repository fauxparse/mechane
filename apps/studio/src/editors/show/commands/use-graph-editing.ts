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
import type { DeletionScope, Gesture, GraphEdit } from "@mechane/commands";
import {
  addNode,
  addSceneVariable,
  addShape,
  addShapeField,
  commandForEdit,
  composite,
  createFlowWithNodes,
  deleteGraphElements,
  deletionScope,
  duplicateShape,
  moveNodesIntoFlow,
  moveNodesOutOfFlow,
  removeSceneVariable,
  removeShape,
  removeShapeField,
  renameNode,
  renameSceneVariable,
  renameShape,
  renameShapeField,
  reorderSceneVariables,
  reorderShapeFields,
  setDevicePerConnection,
  setNodeColor,
  setSceneVariableType,
  setShapeFieldDefault,
  setShapeFieldRequired,
  setShapeFieldType,
  setSourceFieldDefault,
} from "@mechane/commands";
import type {
  ConnectionTargets,
  FlowColor,
  GraphNode,
  NodeKind,
  Position,
  Shape,
  ShapeField,
  ShowGraph,
  Type,
} from "@mechane/domain";
import {
  connectionError,
  connectionTargets,
  generateId,
  planConnection,
  sourceTypeAtHandle,
} from "@mechane/domain";
import { useCallback, useMemo, useRef, useState } from "react";
import { sourceLabelFor } from "../graph/source-label";
import type { SourceTypeChangePlan } from "../graph/inspector/source-type-change";
import {
  planSourceTypeChange,
  sourceTypeChangeHasImpact,
  sourceTypeChangeSignature,
} from "../graph/inspector/source-type-change";

import type { ApiGraph } from "../data/api-graph";
import { handleFor, readHandle, type HandleId } from "../graph/handle-ids";
import { createNode } from "../graph/node-kinds";
import type { GraphCommands } from "./use-graph-commands";
import { useGraphCommands } from "./use-graph-commands";

/** A drag from one node's handle to another's, as React Flow reports it. */
export interface ConnectionAttempt {
  source: string;
  target: string;
  /** The encoded source handle, including a Device's virtual value handle. */
  sourceHandle?: string | null;
  /** The encoded handle dropped on the target. */
  targetHandle?: string | null;
}

export interface GraphCommandEditing {
  commands: GraphCommands;
  graph: ShowGraph;
  amend(edits: readonly GraphEdit[]): void;
}

export interface GraphGestureEditing {
  renaming: string | null;
  beginRename(nodeId: string): void;
  renameTo(name: string): void;
  commitRename(): void;
  cancelRename(): void;
}

export interface GraphCreationEditing {
  createNodeOfKind(
    kind: NodeKind,
    position: Position,
    parentId?: string | null,
    options?: {
      perConnection?: boolean;
      defaultName?: string;
      sourceType?: Type;
      color?: FlowColor;
    },
  ): GraphNode;
  createFlowWithNodes(nodeIds: string[], position: Position, childOrigin: Position): GraphNode;
  createNodeFromConnection(sourceId: string, sourceHandle: string, position: Position): void;
}

export interface GraphDeletionEditing {
  deleteElements(nodeIds: string[], edgeIds?: string[]): void;
  scopeOf(nodeIds: string[], edgeIds?: string[]): DeletionScope;
}

export interface GraphConnectionEditing {
  connecting: boolean;
  targets: ConnectionTargets | null;
  beginConnect(sourceId: string, sourceHandle?: string | null): void;
  endConnect(): void;
  canDrop(attempt: ConnectionAttempt): boolean;
  connect(attempt: ConnectionAttempt): string | null;
}

export interface ShapeEditing {
  addShape(shape: Shape): void;
  renameShape(shapeId: string, name: string): void;
  duplicateShape(shape: Shape): void;
  removeShape(shapeId: string): void;
  addShapeField(shapeId: string, field: ShapeField): void;
  renameShapeField(shapeId: string, fieldId: string, name: string): void;
  setShapeFieldType(shapeId: string, fieldId: string, type: Type): void;
  setShapeFieldRequired(shapeId: string, fieldId: string, required: boolean): void;
  setShapeFieldDefault(shapeId: string, fieldId: string, defaultValue: unknown): void;
  reorderShapeFields(shapeId: string, fieldIds: readonly string[]): void;
  removeShapeField(shapeId: string, fieldId: string): void;
}

export interface VariableEditing {
  addVariable(sceneId: string): void;
  renameVariable(sceneId: string, variableId: string, name: string): void;
  setVariableType(sceneId: string, variableId: string, type: Type): void;
  reorderVariables(sceneId: string, variableIds: readonly string[]): void;
  removeVariable(sceneId: string, variableId: string): void;
}

export interface SourceValueEditing {
  graph: ShowGraph;
  commands: Pick<GraphCommands, "beginGesture">;
  setSourceFieldDefault(nodeId: string, fieldPath: readonly string[], value: unknown): void;
}

export interface GraphEditing {
  command: GraphCommandEditing;
  gestures: GraphGestureEditing;
  creation: GraphCreationEditing;
  deletion: GraphDeletionEditing;
  connections: GraphConnectionEditing;
  shapes: ShapeEditing;
  variables: VariableEditing;
  sourceValues: SourceValueEditing;
  setNodeColor(nodeId: string, color: FlowColor): void;
  setDevicePerConnection(nodeId: string, perConnection: boolean): void;
  setSourceType(
    nodeId: string,
    type: Type,
    confirmedPlan?: SourceTypeChangePlan,
  ): SourceTypeChangePlan | null;
  moveIntoFlow(nodeIds: string[], flowId: string, origin: Position): void;
  moveOutOfFlow(nodeIds: string[], positions: Position[]): string | null;
}
export interface GraphInspectorEditing {
  graph: ShowGraph;
  commands: Pick<GraphCommands, "beginGesture">;
  renaming: string | null;
  beginRename(nodeId: string): void;
  renameTo(name: string): void;
  commitRename(): void;
  cancelRename(): void;
  setNodeColor(nodeId: string, color: FlowColor): void;
  setDevicePerConnection(nodeId: string, perConnection: boolean): void;
  setSourceType(
    nodeId: string,
    type: Type,
    confirmedPlan?: SourceTypeChangePlan,
  ): SourceTypeChangePlan | null;
  addVariable(sceneId: string): void;
  renameVariable(sceneId: string, variableId: string, name: string): void;
  setVariableType(sceneId: string, variableId: string, type: Type): void;
  reorderVariables(sceneId: string, variableIds: readonly string[]): void;
  removeVariable(sceneId: string, variableId: string): void;
  setSourceFieldDefault(nodeId: string, fieldPath: readonly string[], value: unknown): void;
}
export interface GraphInspectorNodeEditing {
  setNodeColor(nodeId: string, color: FlowColor): void;
  setDevicePerConnection(nodeId: string, perConnection: boolean): void;
  setSourceType(
    nodeId: string,
    type: Type,
    confirmedPlan?: SourceTypeChangePlan,
  ): SourceTypeChangePlan | null;
}

export function graphInspectorEditing(
  graph: ShowGraph,
  gestures: GraphGestureEditing,
  variables: VariableEditing,
  sourceValues: SourceValueEditing,
  nodeEditing: GraphInspectorNodeEditing,
): GraphInspectorEditing {
  return {
    graph,
    commands: sourceValues.commands,
    ...gestures,
    ...variables,
    setSourceFieldDefault: sourceValues.setSourceFieldDefault,
    ...nodeEditing,
  };
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
        ? connectionTargets(
            graph,
            connectingFrom.nodeId,
            domainHandle(
              connectingFrom.sourceHandle ? readHandle(connectingFrom.sourceHandle) : null,
            ),
          )
        : null,
    [connectingFrom, graph],
  );
  const createNodeOfKind = useCallback(
    (
      kind: NodeKind,
      position: Position,
      parentId: string | null = null,
      options: {
        perConnection?: boolean;
        defaultName?: string;
        sourceType?: Type;
        color?: FlowColor;
      } = {},
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
      const decodedSource = readHandle(sourceHandle);
      if (!decodedSource) return;
      const domainSourceHandle = domainHandle(decodedSource);
      const sourceType = sourceTypeAtHandle(graph, sourceId, domainSourceHandle);
      const node =
        producer?.kind === "flow" && decodedSource.kind === "output"
          ? createNode("device", position, null, { color: producer?.color })
          : sourceType
            ? createNode("source", position, null, {
                color: producer?.color,
                defaultName: sourceLabelFor(graph, sourceId, domainSourceHandle ?? ""),
                sourceType,
              })
            : null;
      if (!node) return;
      const plan = planConnection(
        graph,
        { sourceId, sourceHandle: domainSourceHandle, targetId: node.id },
        { edgeId: generateId("edge"), variableId: generateId("variable") },
        { addNode: node },
      );
      if ("error" in plan) return;
      execute(
        composite({
          label: node.kind === "device" ? "Create Device" : "Create Source",
          commands: plan.edits.map((edit) => commandForEdit(edit)),
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

  const requestOf = useCallback((attempt: ConnectionAttempt) => {
    const sourceHandle = attempt.sourceHandle ? readHandle(attempt.sourceHandle) : null;
    const targetHandle = attempt.targetHandle ? readHandle(attempt.targetHandle) : null;
    return {
      sourceId: attempt.source,
      targetId: attempt.target,
      sourceHandle: domainHandle(sourceHandle),
      targetHandle: domainHandle(targetHandle),
      targetVariableId: targetHandle?.kind === "variable" ? targetHandle.id : null,
    };
  }, []);

  const canDrop = useCallback(
    (attempt: ConnectionAttempt) => connectionError(graph, requestOf(attempt)) === null,
    [graph, requestOf],
  );

  const connect = useCallback(
    (attempt: ConnectionAttempt) => {
      const request = requestOf(attempt);
      const plan = planConnection(graph, request, {
        edgeId: generateId("edge"),
        variableId: generateId("variable"),
      });
      if ("error" in plan) return plan.error;
      execute(
        composite({
          label: plan.edits.some((edit) => edit.type === "graph.addSceneVariable")
            ? "Create Variable and Connect"
            : "Connect",
          commands: plan.edits.map((edit) => commandForEdit(edit)),
        }),
      );
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

  const setVariableType = useCallback(
    (sceneId: string, variableId: string, type: Type) => {
      execute(setSceneVariableType(sceneId, variableId, type));
    },
    [execute],
  );

  const reorderVariables = useCallback(
    (sceneId: string, variableIds: readonly string[]) => {
      execute(reorderSceneVariables(sceneId, variableIds));
    },
    [execute],
  );

  const changeSourceType = useCallback(
    (nodeId: string, type: Type, confirmedPlan?: SourceTypeChangePlan) => {
      const plan = planSourceTypeChange(graph, nodeId, type);
      if (!plan) return null;
      if (confirmedPlan) {
        if (sourceTypeChangeSignature(confirmedPlan) !== sourceTypeChangeSignature(plan)) {
          return plan;
        }
        execute(
          composite({
            label:
              plan.edgeRemovals.length > 0
                ? "Change Source type and remove affected items"
                : "Change Source type",
            commands: plan.edits.map((edit) => commandForEdit(edit)),
          }),
        );
        return null;
      }
      if (sourceTypeChangeHasImpact(plan)) return plan;
      const [edit] = plan.edits;
      if (edit) execute(commandForEdit(edit));
      return null;
    },
    [execute, graph],
  );

  const removeVariable = useCallback(
    (sceneId: string, variableId: string) => {
      execute(removeSceneVariable(sceneId, variableId));
    },
    [execute],
  );

  const changeNodeColor = useCallback(
    (nodeId: string, color: FlowColor) => {
      execute(setNodeColor(nodeId, color));
    },
    [execute],
  );

  const changeShape = useCallback(
    (shape: Shape) => {
      execute(addShape(shape));
    },
    [execute],
  );

  const changeShapeName = useCallback(
    (shapeId: string, name: string) => {
      execute(renameShape(shapeId, name));
    },
    [execute],
  );

  const changeShapeDuplicate = useCallback(
    (shape: Shape) => {
      execute(duplicateShape(shape));
    },
    [execute],
  );

  const changeShapeRemoval = useCallback(
    (shapeId: string) => {
      execute(removeShape(shapeId));
    },
    [execute],
  );

  const changeShapeField = useCallback(
    (shapeId: string, field: ShapeField) => {
      execute(addShapeField(shapeId, field));
    },
    [execute],
  );

  const changeShapeFieldName = useCallback(
    (shapeId: string, fieldId: string, name: string) => {
      execute(renameShapeField(shapeId, fieldId, name));
    },
    [execute],
  );

  const changeShapeFieldType = useCallback(
    (shapeId: string, fieldId: string, type: Type) => {
      execute(setShapeFieldType(shapeId, fieldId, type));
    },
    [execute],
  );

  const changeShapeFieldRequired = useCallback(
    (shapeId: string, fieldId: string, required: boolean) => {
      execute(setShapeFieldRequired(shapeId, fieldId, required));
    },
    [execute],
  );
  const changeShapeFieldDefault = useCallback(
    (shapeId: string, fieldId: string, defaultValue: unknown) => {
      execute(setShapeFieldDefault(shapeId, fieldId, defaultValue));
    },
    [execute],
  );

  const changeShapeFieldOrder = useCallback(
    (shapeId: string, fieldIds: readonly string[]) => {
      execute(reorderShapeFields(shapeId, fieldIds));
    },
    [execute],
  );

  const changeShapeFieldRemoval = useCallback(
    (shapeId: string, fieldId: string) => {
      execute(removeShapeField(shapeId, fieldId));
    },
    [execute],
  );

  const changeSourceFieldDefault = useCallback(
    (nodeId: string, fieldPath: readonly string[], value: unknown) => {
      execute(setSourceFieldDefault(nodeId, fieldPath, value));
    },
    [execute],
  );

  const changeDevicePerConnection = useCallback(
    (nodeId: string, perConnection: boolean) => {
      execute(setDevicePerConnection(nodeId, perConnection));
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
    command: { commands, graph, amend: commands.amend },
    gestures: {
      renaming,
      beginRename,
      renameTo,
      commitRename,
      cancelRename,
    },
    creation: {
      createNodeOfKind,
      createNodeFromConnection,
      createFlowWithNodes: createFlowWithSelection,
    },
    deletion: { deleteElements, scopeOf },
    connections: {
      connecting: connectingFrom !== null,
      targets,
      beginConnect,
      endConnect,
      canDrop,
      connect,
    },
    shapes: {
      addShape: changeShape,
      renameShape: changeShapeName,
      duplicateShape: changeShapeDuplicate,
      removeShape: changeShapeRemoval,
      addShapeField: changeShapeField,
      renameShapeField: changeShapeFieldName,
      setShapeFieldType: changeShapeFieldType,
      setShapeFieldRequired: changeShapeFieldRequired,
      setShapeFieldDefault: changeShapeFieldDefault,
      reorderShapeFields: changeShapeFieldOrder,
      removeShapeField: changeShapeFieldRemoval,
    },
    variables: {
      addVariable,
      renameVariable,
      setVariableType,
      reorderVariables,
      removeVariable,
    },
    sourceValues: {
      graph,
      commands: { beginGesture: commands.beginGesture },
      setSourceFieldDefault: changeSourceFieldDefault,
    },
    setNodeColor: changeNodeColor,
    setDevicePerConnection: changeDevicePerConnection,
    setSourceType: changeSourceType,
    moveIntoFlow,
    moveOutOfFlow,
  };
}
function domainHandle(handle: HandleId | null): string | null {
  if (!handle) return null;
  switch (handle.kind) {
    case "input":
    case "output":
      return handleFor(handle);
    case "variable":
    case "field":
      return handle.id;
    case "deviceSource":
      return handle.name;
  }
}
