// The Show editor's command stack (issue #41): the editor's graph state and
// the undo/redo history over it, in one hook.
//
// The graph the editor draws is the *command stack's* state, not the query
// result. A fetched graph is converted once (./api-graph) and from then on
// every change to it is a Command — which is what makes undo possible at all
// (PRD §6.3), and why there's no second path that edits the graph directly.
//
// Session-local, per ADR-0005: the history lives in this hook's lifetime and
// dies with it. A refetch or a different Show `reset`s it rather than
// rebasing it, because an inverse captured against the old graph has no
// honest meaning against a new one.
//
// Persistence rides the stack's `dispatch` seam (#42): `onEdit` is called with
// the *edits* every landed command produced, and the graph they produced —
// including the ones an undo produced, because an undo is an ordinary forward
// command (ADR-0005). One path to the server, whichever direction the edit
// came from.
//
// The edits are what actually goes over the wire (#103): the graph comes with
// them because a caller may want to show something about it, not because it
// is sent. Debouncing and batching are the caller's business; this hook
// reports every edit as it happens.
import { CommandStack, commandForEdit } from "@mechane/commands";
import type { GraphEdit, Gesture, ShowGraphCommand } from "@mechane/commands";
import type { ShowGraph } from "@mechane/domain/graph";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const EMPTY_GRAPH: ShowGraph = { shapes: [], nodes: [], edges: [] };

export interface GraphCommands {
  /** The graph as edited — what the editor draws. */
  graph: ShowGraph;
  /** Applies one command as one undo entry. */
  execute(command: ShowGraphCommand): void;
  executeCommitted(command: ShowGraphCommand): void;
  commitGesture(): void;
  setBlocked(blocked: boolean): void;
  /**
   * Applies edits that arrived from the server rather than from the user
   * (#111) — no undo entry, and nothing sent back. See `CommandStack.amend`.
   */
  amend(edits: readonly GraphEdit[]): void;
  /**
   * Opens (or joins) a continuous gesture — a drag, a rename being typed.
   * Every update inside it lands as a single undo entry when it commits (#28).
   */
  beginGesture(options: { key: string; label: string }): Gesture<ShowGraph, GraphEdit>;
  /** True while a gesture is mid-flight, so the view can hold its own state. */
  hasOpenGesture: boolean;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  /** What undo/redo would do next, for a menu item or tooltip. */
  undoLabel: string | null;
  redoLabel: string | null;
}

/**
 * Holds `source` as an editable graph with an undo/redo history.
 *
 * `source` is the graph the route opened this editor with, or null while it
 * is loading. A *different* graph is a different document: state replaced,
 * history dropped. That is identity, not content comparison — the route
 * decodes once and holds the result (#750), so the same document stays the
 * same object however often its cache entry is rewritten underneath.
 */
export function useGraphCommands(
  source: ShowGraph | null | undefined,
  onEdit?: (edits: readonly GraphEdit[], graph: ShowGraph) => void,
): GraphCommands {
  // Held in a ref so a caller passing an inline callback doesn't rebuild the
  // stack — the stack is built once, on purpose (see the `useMemo` below).
  // Written in an effect rather than during render: React may replay or throw
  // away a render, and a mutation from one that never commits would leak.
  // Commands only ever dispatch from an event handler, so the ref is always
  // current by the time `dispatch` reads it.
  const edited = useRef(onEdit);
  useEffect(() => {
    edited.current = onEdit;
  }, [onEdit]);
  const [graph, setGraph] = useState<ShowGraph>(() => source ?? EMPTY_GRAPH);
  const blocked = useRef(false);
  const [blockedState, setBlockedState] = useState(false);
  const committed = useRef(false);
  // Bumped whenever something changes that isn't visible in `graph` itself —
  // a gesture committing lands an entry without moving the state, and the
  // undo button has to notice.
  const [, setRevision] = useState(0);

  const stack = useMemo(
    () =>
      new CommandStack<ShowGraph, GraphEdit>({
        state: source ?? EMPTY_GRAPH,
        onChange: setGraph,
        dispatch: (_command, next, edits) => {
          if (!committed.current) edited.current?.(edits, next);
        },
      }),
    // Deliberately built from the first `source` only: replacing it later is
    // `reset`'s job below, so the stack instance (and the gesture that may be
    // open on it) survives a refetch that changes nothing.
    // react-doctor-disable-next-line react-doctor/exhaustive-deps
    [],
  );

  const changed = useCallback(() => setRevision((revision) => revision + 1), []);

  // A different graph is a different document: state replaced, history
  // dropped. The route decodes once and holds the result, so a cache rewrite
  // that does not change which document is open never reaches here.
  const applied = useRef(source);
  useEffect(() => {
    if (applied.current === source) return;
    applied.current = source;
    stack.reset(source ?? EMPTY_GRAPH);
    changed();
  }, [changed, source, stack]);
  const requireWritable = useCallback(() => {
    if (blocked.current)
      throw new Error("Check the submitted clipboard result before editing or using history.");
  }, []);

  const commitGesture = useCallback(() => {
    if (blocked.current) return;
    stack.openGesture?.commit();
    changed();
  }, [changed, stack]);

  const setBlocked = useCallback(
    (value: boolean) => {
      if (value && !blocked.current) {
        stack.openGesture?.commit();
      }
      blocked.current = value;
      setBlockedState(value);
      changed();
    },
    [changed, stack],
  );

  const executeCommitted = useCallback(
    (command: ShowGraphCommand) => {
      committed.current = true;
      try {
        stack.execute(command);
        changed();
      } finally {
        committed.current = false;
      }
    },
    [changed, stack],
  );

  const execute = useCallback(
    (command: ShowGraphCommand) => {
      requireWritable();
      stack.execute(command);
      changed();
    },
    [changed, requireWritable, stack],
  );

  const amend = useCallback(
    (edits: readonly GraphEdit[]) => {
      for (const edit of edits) stack.amend(commandForEdit(edit));
      changed();
    },
    [changed, stack],
  );

  const beginGesture = useCallback(
    (options: { key: string; label: string }): Gesture<ShowGraph, GraphEdit> => {
      requireWritable();
      const gesture = stack.beginGesture(options);
      changed();
      // Wrapped so the ends of a gesture re-render too: committing changes
      // what undo would do without changing the graph.
      return {
        ...gesture,
        get isOpen() {
          return gesture.isOpen;
        },
        get isEmpty() {
          return gesture.isEmpty;
        },
        update: (command) => {
          requireWritable();
          return gesture.update(command);
        },
        commit: () => {
          requireWritable();
          const landed = gesture.commit();
          changed();
          return landed;
        },
        abort: () => {
          requireWritable();
          const next = gesture.abort();
          changed();
          return next;
        },
      };
    },
    [changed, requireWritable, stack],
  );

  const undo = useCallback(() => {
    if (blocked.current) return;
    stack.undo();
    changed();
  }, [changed, stack]);

  const redo = useCallback(() => {
    if (blocked.current) return;
    stack.redo();
    changed();
  }, [changed, stack]);
  return {
    graph,
    execute,
    amend,
    executeCommitted,
    commitGesture,
    setBlocked,
    beginGesture,
    hasOpenGesture: stack.openGesture !== null,
    undo,
    redo,
    canUndo: !blockedState && stack.canUndo,
    canRedo: !blockedState && stack.canRedo,
    undoLabel: stack.undoLabel,
    redoLabel: stack.redoLabel,
  };
}
