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
import { CommandStack } from "@mechane/commands";
import type { GraphEdit, Gesture, ShowGraphCommand } from "@mechane/commands";
import type { ShowGraph } from "@mechane/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { toShowGraph } from "../data/api-graph";
import type { ApiGraph } from "../data/api-graph";

export interface GraphCommands {
  /** The graph as edited — what the editor draws. */
  graph: ShowGraph;
  /** Applies one command as one undo entry. */
  execute(command: ShowGraphCommand): void;
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
 * `source` is the graph as the API returned it, or null while it's loading.
 * A new `source` object replaces the graph and clears the history.
 */
export function useGraphCommands(
  source: ApiGraph | null | undefined,
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
  const [graph, setGraph] = useState<ShowGraph>(() => toShowGraph(source));
  // Bumped whenever something changes that isn't visible in `graph` itself —
  // a gesture committing lands an entry without moving the state, and the
  // undo button has to notice.
  const [, setRevision] = useState(0);

  const stack = useMemo(
    () =>
      new CommandStack<ShowGraph, GraphEdit>({
        state: toShowGraph(source),
        onChange: setGraph,
        dispatch: (_command, next, edits) => edited.current?.(edits, next),
      }),
    // Deliberately built from the first `source` only: replacing it later is
    // `reset`'s job below, so the stack instance (and the gesture that may be
    // open on it) survives a refetch that changes nothing.
    // react-doctor-disable-next-line react-doctor/exhaustive-deps
    [],
  );

  const changed = useCallback(() => setRevision((revision) => revision + 1), []);

  // A different graph arriving is a new document, not an edit: state
  // replaced, history dropped. The first render already built the stack from
  // this `source`, so the initial pass has nothing to do.
  const applied = useRef(source);
  useEffect(() => {
    if (applied.current === source) return;
    applied.current = source;
    stack.reset(toShowGraph(source));
    changed();
  }, [changed, source, stack]);

  const execute = useCallback(
    (command: ShowGraphCommand) => {
      stack.execute(command);
      changed();
    },
    [changed, stack],
  );

  const beginGesture = useCallback(
    (options: { key: string; label: string }): Gesture<ShowGraph, GraphEdit> => {
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
      };
    },
    [changed, stack],
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
    graph,
    execute,
    beginGesture,
    hasOpenGesture: stack.openGesture !== null,
    undo,
    redo,
    canUndo: stack.canUndo,
    canRedo: stack.canRedo,
    undoLabel: stack.undoLabel,
    redoLabel: stack.redoLabel,
  };
}
