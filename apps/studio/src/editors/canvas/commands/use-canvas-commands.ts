import type {
  CanvasWorkspace,
  CanvasWorkspaceCommand,
  CanvasWorkspaceEdit,
  Gesture,
  NewElement,
} from "@mechane/commands";
import {
  addCanvasElement,
  CommandStack,
  moveCanvasArtboard,
  moveCanvasElement,
  moveCanvasElementBetweenCanvases,
  removeCanvasElement,
  updateCanvasElement,
  updateCanvasElements,
} from "@mechane/commands";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Position } from "@mechane/domain";

import type { CanvasArtboardDocument } from "../../../api/canvas";

function toWorkspace(source: readonly CanvasArtboardDocument[] | undefined): CanvasWorkspace {
  return {
    artboards: (source ?? []).map(({ canvasId, canvas, position }) => ({
      canvasId,
      canvas,
      position: { ...position },
    })),
  };
}

export interface CanvasCommands {
  workspace: CanvasWorkspace;
  beginArtboardMove(canvasId: string): void;
  updateArtboardMove(canvasId: string, position: Position): void;
  endArtboardMove(canvasId: string, cancel?: boolean): void;
  moveElement(
    canvasId: string,
    elementId: string,
    parentId: string,
    rank: string,
    properties?: Record<string, unknown>,
    unsetProperties?: readonly string[],
  ): void;
  moveElementBetweenCanvases(
    sourceCanvasId: string,
    targetCanvasId: string,
    elementId: string,
    parentId: string,
    rank: string,
    properties?: Record<string, unknown>,
    unsetProperties?: readonly string[],
  ): void;
  updateElement(
    canvasId: string,
    elementId: string,
    properties: Record<string, unknown>,
    unsetProperties?: readonly string[],
  ): void;
  updateElements(
    canvasId: string,
    updates: readonly {
      readonly elementId: string;
      readonly properties: Record<string, unknown>;
      readonly unsetProperties?: readonly string[];
    }[],
  ): void;
  createElement(canvasId: string, element: NewElement, parentId: string, rank: string): void;
  /** Applies one prepared Canvas command as one undo entry. */
  execute(command: CanvasWorkspaceCommand): void;
  removeElements(canvasId: string, elementIds: readonly string[]): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
}

/** Keeps the Canvas workspace in the shared command stack and save path. */
export function useCanvasCommands(
  source: readonly CanvasArtboardDocument[] | undefined,
  onEdit?: (edits: readonly CanvasWorkspaceEdit[], workspace: CanvasWorkspace) => void,
): CanvasCommands {
  const edited = useRef(onEdit);
  useEffect(() => {
    edited.current = onEdit;
  }, [onEdit]);
  const [workspace, setWorkspace] = useState<CanvasWorkspace>(() => toWorkspace(source));
  const [, setRevision] = useState(0);
  const gestures = useRef(new Map<string, Gesture<CanvasWorkspace, CanvasWorkspaceEdit>>());

  const stack = useMemo(
    () =>
      new CommandStack<CanvasWorkspace, CanvasWorkspaceEdit>({
        state: toWorkspace(source),
        onChange: setWorkspace,
        dispatch: (_command, next, edits) => edited.current?.(edits, next),
      }),
    // The stack is reset below when a new query result arrives.
    // react-doctor-disable-next-line react-doctor/exhaustive-deps
    [],
  );

  const changed = useCallback(() => setRevision((revision) => revision + 1), []);
  const applied = useRef(source);
  useEffect(() => {
    if (applied.current === source) return;
    applied.current = source;
    gestures.current.clear();
    stack.reset(toWorkspace(source));
    setWorkspace(stack.state);
    changed();
  }, [changed, source, stack]);

  const beginArtboardMove = useCallback(
    (canvasId: string) => {
      gestures.current.set(
        canvasId,
        stack.beginGesture({ key: `move-artboard:${canvasId}`, label: "Move Artboard" }),
      );
      changed();
    },
    [changed, stack],
  );
  const createElement = useCallback(
    (canvasId: string, element: NewElement, parentId: string, rank: string) => {
      stack.execute(addCanvasElement(canvasId, element, parentId, rank));
      changed();
    },
    [changed, stack],
  );

  const execute = useCallback(
    (command: CanvasWorkspaceCommand) => {
      stack.execute(command);
      changed();
    },
    [changed, stack],
  );

  const removeElements = useCallback(
    (canvasId: string, elementIds: readonly string[]) => {
      // Deleting a Frame takes its descendants with it, so a selection holding both a Frame and
      // something inside it would ask twice for the same Element. Whichever goes first wins and
      // the second throws, so each removal stands on its own.
      for (const elementId of elementIds) {
        try {
          stack.execute(removeCanvasElement(canvasId, elementId));
        } catch {
          // Already gone with an ancestor, or the Canvas root, which cannot be removed.
        }
      }
      changed();
    },
    [changed, stack],
  );

  const moveElement = useCallback(
    (
      canvasId: string,
      elementId: string,
      parentId: string,
      rank: string,
      properties: Record<string, unknown> = {},
      unsetProperties: readonly string[] = [],
    ) => {
      stack.execute(
        moveCanvasElement(canvasId, elementId, parentId, rank, properties, unsetProperties),
      );
      changed();
    },
    [changed, stack],
  );
  const moveElementBetweenCanvases = useCallback(
    (
      sourceCanvasId: string,
      targetCanvasId: string,
      elementId: string,
      parentId: string,
      rank: string,
      properties: Record<string, unknown> = {},
      unsetProperties: readonly string[] = [],
    ) => {
      stack.execute(
        moveCanvasElementBetweenCanvases(
          sourceCanvasId,
          targetCanvasId,
          elementId,
          parentId,
          rank,
          properties,
          unsetProperties,
        ),
      );
      changed();
    },
    [changed, stack],
  );
  const updateElement = useCallback(
    (
      canvasId: string,
      elementId: string,
      properties: Record<string, unknown>,
      unsetProperties: readonly string[] = [],
    ) => {
      stack.execute(updateCanvasElement(canvasId, elementId, properties, unsetProperties));
      changed();
    },
    [changed, stack],
  );
  const updateElements = useCallback(
    (
      canvasId: string,
      updates: readonly {
        readonly elementId: string;
        readonly properties: Record<string, unknown>;
        readonly unsetProperties?: readonly string[];
      }[],
    ) => {
      stack.execute(updateCanvasElements(canvasId, updates));
      changed();
    },
    [changed, stack],
  );

  const updateArtboardMove = useCallback(
    (canvasId: string, position: Position) => {
      const gesture = gestures.current.get(canvasId);
      if (!gesture?.isOpen) return;
      gesture.update(moveCanvasArtboard(canvasId, position));
      changed();
    },
    [changed],
  );

  const endArtboardMove = useCallback(
    (canvasId: string, cancel = false) => {
      const gesture = gestures.current.get(canvasId);
      gestures.current.delete(canvasId);
      if (!gesture?.isOpen) return;
      if (cancel) gesture.abort();
      else gesture.commit();
      changed();
    },
    [changed],
  );
  const undo = useCallback(() => {
    stack.undo();
    changed();
  }, [changed, stack]);

  const redo = useCallback(() => {
    stack.redo();
    changed();
  }, [changed, stack]);

  return {
    workspace,
    beginArtboardMove,
    updateArtboardMove,
    endArtboardMove,
    moveElement,
    moveElementBetweenCanvases,
    updateElement,
    updateElements,
    createElement,
    execute,
    removeElements,
    undo,
    redo,
    canUndo: stack.canUndo,
    canRedo: stack.canRedo,
  };
}
