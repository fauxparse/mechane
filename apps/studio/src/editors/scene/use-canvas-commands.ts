import { CommandStack } from "@mechane/commands";
import type { CanvasCommand, CanvasDocument, CanvasEdit, CanvasGesture } from "@mechane/commands";
import type { Canvas } from "@mechane/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface CanvasCommands {
  canvas: CanvasDocument;
  execute(command: CanvasCommand): void;
  beginGesture(options: { key: string; label: string }): CanvasGesture;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
}

function documentFromSource(source: Canvas | null | undefined): CanvasDocument {
  if (!source) {
    return {
      id: "canvas:loading",
      kind: "scene",
      root: { id: "element:loading", type: "frame", children: [] },
    };
  }
  return source as CanvasDocument;
}

export function useCanvasCommands(
  source: Canvas | null | undefined,
  onEdit?: (edits: readonly CanvasEdit[], canvas: CanvasDocument) => void,
): CanvasCommands {
  const edited = useRef(onEdit);
  useEffect(() => {
    edited.current = onEdit;
  }, [onEdit]);
  const [canvas, setCanvas] = useState<CanvasDocument>(() => documentFromSource(source));
  const [, setRevision] = useState(0);
  const stack = useMemo(
    () =>
      new CommandStack<CanvasDocument, CanvasEdit>({
        state: documentFromSource(source),
        onChange: setCanvas,
        dispatch: (_command, next, edits) => edited.current?.(edits, next),
      }),
    // The stack is intentionally created once; the effect below resets it
    // when the source document changes without discarding local history.
    // react-doctor-disable-next-line react-doctor/exhaustive-deps
    [],
  );
  const changed = useCallback(() => setRevision((revision) => revision + 1), []);
  const applied = useRef(source);
  useEffect(() => {
    if (applied.current === source) return;
    applied.current = source;
    stack.reset(documentFromSource(source));
    changed();
  }, [changed, source, stack]);
  const execute = useCallback(
    (command: CanvasCommand) => {
      stack.execute(command);
      changed();
    },
    [changed, stack],
  );
  const beginGesture = useCallback(
    (options: { key: string; label: string }) => {
      const gesture = stack.beginGesture(options);
      changed();
      return {
        ...gesture,
        get isOpen() {
          return gesture.isOpen;
        },
        get isEmpty() {
          return gesture.isEmpty;
        },
        commit: () => {
          const landed = gesture.commit();
          changed();
          return landed;
        },
        abort: () => {
          const next = gesture.abort();
          changed();
          return next;
        },
      } satisfies CanvasGesture;
    },
    [changed, stack],
  );
  return {
    canvas,
    execute,
    beginGesture,
    undo: () => {
      stack.undo();
      changed();
    },
    redo: () => {
      stack.redo();
      changed();
    },
    canUndo: stack.canUndo,
    canRedo: stack.canRedo,
  };
}
