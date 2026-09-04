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
  addCue,
  addNavigateAction,
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
  renameCue as renameCueCommand,
  renameNode,
  renameSceneAndCue,
  renameSceneVariable,
  renameShape,
  renameShapeField,
  reorderSceneVariables,
  reorderShapeFields,
  reparentNode,
  setCueActionOrder,
  setDevicePerConnection,
  setEdgeLayout,
  setFlowDefaultScene,
  setFlowSize,
  setNodeColor,
  setSceneVariableDefault,
  setSceneVariableType,
  setShapeFieldDefault,
  setShapeFieldRequired,
  setShapeFieldType,
  setSourceFieldDefault,
} from "@mechane/commands";
import type {
  ConnectionTargets,
  EdgeLayout,
  FlowColor,
  FlowSize,
  GraphNode,
  InteractionOwner,
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
import type { SourceTypeChangePlan } from "../graph/inspector/source-type-change";
import {
  planSourceTypeChange,
  sourceTypeChangeHasImpact,
  sourceTypeChangeSignature,
} from "../graph/inspector/source-type-change";
import { sourceLabelFor } from "../graph/source-label";

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

export interface RootNavigationPlan {
  flow?: Extract<GraphNode, { kind: "flow" }>;
  destination?: Extract<GraphNode, { kind: "scene" }>;
  sourcePosition?: Position;
  destinationPosition?: Position;
  flowSize?: FlowSize;
  cueId?: string;
}

export interface GraphCommandEditing {
  commands: GraphCommands;
  graph: ShowGraph;
  amend(edits: readonly GraphEdit[]): void;
}

export interface GraphGestureEditing {
  renaming: string | null;
  beginRename(nodeId: string): void;
  beginCreationRename(nodeId: string, cueId: string): void;
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
  createSceneFromConnection(
    sourceId: string,
    sourceHandle: string,
    plan: RootNavigationPlan,
  ): string | null;
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
  connect(attempt: ConnectionAttempt, plan?: RootNavigationPlan): string | null;
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
  setVariableDefault(sceneId: string, variableId: string, defaultValue: unknown): void;
  reorderVariables(sceneId: string, variableIds: readonly string[]): void;
  removeVariable(sceneId: string, variableId: string): void;
}

export interface SourceValueEditing {
  graph: ShowGraph;
  commands: Pick<GraphCommands, "beginGesture">;
  setSourceFieldDefault(nodeId: string, fieldPath: readonly string[], value: unknown): void;
}

export interface GraphEdgeEditing {
  /**
   * Records where an edge's runs have been dragged (#475). `committed` is
   * false while the pointer is still down and true on release, so a drag
   * previews live and leaves one entry on the undo stack rather than one per
   * frame — the same shape as an inline rename.
   */
  moveEdge(edgeId: string, layout: EdgeLayout, options: { committed: boolean }): void;
}
export interface InteractionEditing {
  addCue(owner: InteractionOwner): void;
  renameCue(cueId: string, name: string): void;
}

export interface GraphEditing {
  command: GraphCommandEditing;
  gestures: GraphGestureEditing;
  edges: GraphEdgeEditing;
  creation: GraphCreationEditing;
  deletion: GraphDeletionEditing;
  connections: GraphConnectionEditing;
  shapes: ShapeEditing;
  variables: VariableEditing;
  sourceValues: SourceValueEditing;
  interaction: InteractionEditing;
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

export interface GraphInspectorNodeEditing {
  setNodeColor(nodeId: string, color: FlowColor): void;
  setDevicePerConnection(nodeId: string, perConnection: boolean): void;
  setSourceType(
    nodeId: string,
    type: Type,
    confirmedPlan?: SourceTypeChangePlan,
  ): SourceTypeChangePlan | null;
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
  setVariableDefault(sceneId: string, variableId: string, defaultValue: unknown): void;
  reorderVariables(sceneId: string, variableIds: readonly string[]): void;
  removeVariable(sceneId: string, variableId: string): void;
  setSourceFieldDefault(nodeId: string, fieldPath: readonly string[], value: unknown): void;
  addCue(owner: InteractionOwner): void;
  renameCue(cueId: string, name: string): void;
}

export function graphInspectorEditing(
  graph: ShowGraph,
  gestures: GraphGestureEditing,
  variables: VariableEditing,
  sourceValues: SourceValueEditing,
  nodeEditing: GraphInspectorNodeEditing,
  interaction: InteractionEditing,
): GraphInspectorEditing {
  return {
    graph,
    commands: sourceValues.commands,
    ...gestures,
    ...variables,
    setSourceFieldDefault: sourceValues.setSourceFieldDefault,
    ...nodeEditing,
    ...interaction,
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
  const creationRename = useRef<{ cueId: string; linked: boolean } | null>(null);
  const rename = useRef<Gesture<ShowGraph, GraphEdit> | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{
    nodeId: string;
    sourceHandle: string | null;
  } | null>(null);
  const targets = useMemo(() => {
    if (!connectingFrom) return null;
    const sourceHandle = connectingFrom.sourceHandle
      ? readHandle(connectingFrom.sourceHandle)
      : null;
    return sourceHandle?.kind === "cue"
      ? cueConnectionTargets(graph, sourceHandle.id)
      : connectionTargets(graph, connectingFrom.nodeId, domainHandle(sourceHandle));
  }, [connectingFrom, graph]);
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
  const createSceneFromConnection = useCallback(
    (sourceId: string, sourceHandle: string, rootPlan: RootNavigationPlan) => {
      const source = graph.nodes.find((node) => node.id === sourceId);
      const decodedSource = readHandle(sourceHandle);
      const destination = rootPlan.destination;
      if (source?.kind !== "scene" || decodedSource?.kind !== "output" || !destination) {
        return "Scene creation uses a root header handle.";
      }
      if (source.id === destination.id) return "A Scene cannot navigate to itself.";
      if (rootPlan.flow) {
        if (
          source.parentId !== null ||
          rootPlan.flow.parentId !== null ||
          !rootPlan.sourcePosition ||
          !rootPlan.destinationPosition ||
          !rootPlan.flowSize ||
          destination.parentId !== rootPlan.flow.id
        ) {
          return "Scene creation has invalid Flow geometry.";
        }
      } else if (!source.parentId || destination.parentId !== source.parentId) {
        return "A new Scene must be created inside the source Scene's Flow.";
      }
      const cue = {
        id: rootPlan.cueId ?? generateId("cue"),
        name: `Go to ${destination.name}`,
        owner: { kind: "scene" as const, sceneId: source.id },
        actionIds: [] as string[],
      };
      const action = {
        id: generateId("action"),
        cueId: cue.id,
        kind: "navigate" as const,
        targetSceneId: destination.id,
      };
      const flowCommands = rootPlan.flow
        ? [
            addNode(rootPlan.flow, "Create Flow"),
            reparentNode(source.id, rootPlan.flow.id, rootPlan.sourcePosition!),
            setFlowDefaultScene(rootPlan.flow.id, source.id),
            setFlowSize(rootPlan.flow.id, rootPlan.flowSize!),
          ]
        : rootPlan.flowSize && source.parentId
          ? [setFlowSize(source.parentId, rootPlan.flowSize)]
          : [];
      execute(
        composite({
          label: "Create Scene Navigation",
          commands: [
            ...flowCommands,
            addNode(destination, "Create Scene"),
            addCue(cue),
            addNavigateAction(action),
            setCueActionOrder(cue.id, [action.id]),
          ],
        }),
      );
      return null;
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

  // Dragging an edge handle is a gesture for the same reason a rename is: the
  // pointer emits a move every frame, and every one of those is a graph edit.
  // Opened lazily, so an edge merely clicked never opens an empty one.
  const edgeLayout = useRef<Gesture<ShowGraph> | null>(null);

  const moveEdge = useCallback(
    (edgeId: string, layout: EdgeLayout, { committed }: { committed: boolean }) => {
      edgeLayout.current ??= beginGesture({ key: `edgeLayout:${edgeId}`, label: "Move edge" });
      edgeLayout.current.update(setEdgeLayout(edgeId, layout));
      if (!committed) return;
      edgeLayout.current.commit();
      edgeLayout.current = null;
    },
    [beginGesture],
  );

  // Renaming is a gesture, so N keystrokes are one undo entry (#28). The
  // gesture is opened lazily on the first keystroke: opening it on
  // double-click would mean an empty gesture for every rename the user thinks
  // better of.
  const beginRename = useCallback((nodeId: string) => {
    rename.current = null;
    creationRename.current = null;
    renamingNode.current = nodeId;
    setRenaming(nodeId);
  }, []);

  const beginCreationRename = useCallback((nodeId: string, cueId: string) => {
    rename.current = null;
    creationRename.current = { cueId, linked: true };
    renamingNode.current = nodeId;
    setRenaming(nodeId);
  }, []);

  const renameTo = useCallback(
    (name: string) => {
      const nodeId = renamingNode.current;
      if (!nodeId) return;
      const link = creationRename.current;
      const edit =
        link?.linked === true
          ? renameSceneAndCue(nodeId, link.cueId, name)
          : renameNode(nodeId, name);
      rename.current ??= beginGesture({ key: `rename:${nodeId}`, label: "Rename" });
      rename.current.update(edit);
    },
    [beginGesture],
  );

  const commitRename = useCallback(() => {
    rename.current?.commit();
    rename.current = null;
    creationRename.current = null;
    renamingNode.current = null;
    setRenaming(null);
  }, []);

  // Escape abandons the gesture, restoring the names captured by its first
  // command while leaving the newly-created graph objects intact.
  const cancelRename = useCallback(() => {
    rename.current?.abort();
    rename.current = null;
    creationRename.current = null;
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
    (attempt: ConnectionAttempt) => {
      const sourceHandle = attempt.sourceHandle ? readHandle(attempt.sourceHandle) : null;
      const targetHandle = attempt.targetHandle ? readHandle(attempt.targetHandle) : null;
      const source = graph.nodes.find((node) => node.id === attempt.source);
      const target = graph.nodes.find((node) => node.id === attempt.target);
      if (
        source?.kind === "scene" &&
        target?.kind === "scene" &&
        sourceHandle?.kind === "output" &&
        targetHandle?.kind === "input"
      ) {
        return source.id !== target.id && source.parentId === target.parentId;
      }
      return sourceHandle?.kind === "cue"
        ? cueConnectionError(graph, attempt) === null
        : connectionError(graph, requestOf(attempt)) === null;
    },
    [graph, requestOf],
  );

  const connect = useCallback(
    (attempt: ConnectionAttempt, rootPlan?: RootNavigationPlan) => {
      const sourceHandle = attempt.sourceHandle ? readHandle(attempt.sourceHandle) : null;
      if (sourceHandle?.kind === "cue") {
        const error = cueConnectionError(graph, attempt);
        if (error) return error;
        const target = graph.nodes.find((node) => node.id === attempt.target);
        if (!target || target.kind !== "scene") return "A Navigate Action must connect to a Scene.";
        const cue = (graph.cues ?? []).find((candidate) => candidate.id === sourceHandle.id);
        if (!cue) return "That Cue no longer exists.";
        const action = {
          id: generateId("action"),
          cueId: cue.id,
          kind: "navigate" as const,
          targetSceneId: target.id,
        };
        execute(
          composite({
            label: "Add Navigate Action",
            commands: [
              addNavigateAction(action),
              setCueActionOrder(cue.id, [...cue.actionIds, action.id]),
            ],
          }),
        );
        return null;
      }

      if (rootPlan) {
        const source = graph.nodes.find((node) => node.id === attempt.source);
        const target = graph.nodes.find((node) => node.id === attempt.target);
        const targetHandle = attempt.targetHandle ? readHandle(attempt.targetHandle) : null;
        if (
          source?.kind !== "scene" ||
          target?.kind !== "scene" ||
          sourceHandle?.kind !== "output" ||
          targetHandle?.kind !== "input"
        ) {
          return "Scene navigation uses root header handles.";
        }
        if (source.id === target.id) return "A Scene cannot navigate to itself.";
        if (source.parentId !== target.parentId) {
          return "Navigate targets must share a Flow.";
        }
        if (source.parentId === null && !rootPlan.flow) {
          return "Root Scenes must be placed in a Flow before they can navigate.";
        }
        if (
          rootPlan.flow &&
          (!rootPlan.sourcePosition || !rootPlan.destinationPosition || !rootPlan.flowSize)
        ) {
          return "Scene navigation has incomplete Flow geometry.";
        }
        if (source.parentId !== null && rootPlan.flow) {
          return "Scenes already in a Flow cannot be wrapped in another Flow.";
        }
        const cue = {
          id: generateId("cue"),
          name: `Go to ${target.name}`,
          owner: { kind: "scene" as const, sceneId: source.id },
          actionIds: [] as string[],
        };
        const action = {
          id: generateId("action"),
          cueId: cue.id,
          kind: "navigate" as const,
          targetSceneId: target.id,
        };
        const commands = rootPlan.flow
          ? [
              addNode(rootPlan.flow, "Create Flow"),
              reparentNode(source.id, rootPlan.flow.id, rootPlan.sourcePosition!),
              reparentNode(target.id, rootPlan.flow.id, rootPlan.destinationPosition!),
              setFlowDefaultScene(rootPlan.flow.id, source.id),
              setFlowSize(rootPlan.flow.id, rootPlan.flowSize!),
            ]
          : [];
        commands.push(
          addCue(cue),
          addNavigateAction(action),
          setCueActionOrder(cue.id, [action.id]),
        );
        execute(composite({ label: "Create Scene Navigation", commands }));
        return null;
      }

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
  const setVariableDefault = useCallback(
    (sceneId: string, variableId: string, defaultValue: unknown) => {
      execute(setSceneVariableDefault(sceneId, variableId, defaultValue));
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

  const addInteractionCue = useCallback(
    (owner: InteractionOwner) => {
      execute(
        addCue({
          id: generateId("cue"),
          name: "New cue",
          owner,
          actionIds: [],
        }),
      );
    },
    [execute],
  );

  const renameInteractionCue = useCallback(
    (cueId: string, name: string) => {
      if (creationRename.current?.cueId === cueId) creationRename.current.linked = false;
      execute(renameCueCommand(cueId, name));
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
      beginCreationRename,
      renameTo,
      commitRename,
      cancelRename,
    },
    edges: { moveEdge },
    creation: {
      createNodeOfKind,
      createNodeFromConnection,
      createFlowWithNodes: createFlowWithSelection,
      createSceneFromConnection,
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
      setVariableDefault,
      reorderVariables,
      removeVariable,
    },
    sourceValues: {
      graph,
      commands: { beginGesture: commands.beginGesture },
      setSourceFieldDefault: changeSourceFieldDefault,
    },
    interaction: { addCue: addInteractionCue, renameCue: renameInteractionCue },
    setNodeColor: changeNodeColor,
    setDevicePerConnection: changeDevicePerConnection,
    setSourceType: changeSourceType,
    moveIntoFlow,
    moveOutOfFlow,
  };
}
function cueConnectionTargets(graph: ShowGraph, cueId: string): ConnectionTargets {
  const cue = (graph.cues ?? []).find((candidate) => candidate.id === cueId);
  const nodeIds = new Set<string>();
  if (cue?.owner.kind === "scene") {
    const ownerSceneId = cue.owner.sceneId;
    const scene = graph.nodes.find((node) => node.kind === "scene" && node.id === ownerSceneId);
    if (scene?.parentId) {
      graph.nodes.forEach((node) => {
        if (node.kind === "scene" && node.parentId === scene.parentId) nodeIds.add(node.id);
      });
    }
  }
  return { nodeIds, variableIds: new Set<string>(), fieldIds: new Set<string>() };
}

function cueConnectionError(graph: ShowGraph, attempt: ConnectionAttempt): string | null {
  const sourceHandle = attempt.sourceHandle ? readHandle(attempt.sourceHandle) : null;
  if (sourceHandle?.kind !== "cue") return null;
  const cue = (graph.cues ?? []).find((candidate) => candidate.id === sourceHandle.id);
  if (!cue) return "That Cue no longer exists.";
  const owner = cue.owner;
  if (owner.kind !== "scene") return "Block Cues cannot connect to runtime targets yet.";
  const target = graph.nodes.find((node) => node.id === attempt.target);
  const targetHandle = attempt.targetHandle ? readHandle(attempt.targetHandle) : null;
  if (!target || target.kind !== "scene" || targetHandle?.kind !== "input") {
    return "A Navigate Action must connect to a Scene.";
  }
  const source = graph.nodes.find((node) => node.kind === "scene" && node.id === owner.sceneId);
  if (!source?.parentId || source.parentId !== target.parentId) {
    return "Navigate targets must stay in the Cue's Flow.";
  }
  return null;
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
    case "cue":
      return null;
    case "deviceSource":
      return handle.name;
  }
}
