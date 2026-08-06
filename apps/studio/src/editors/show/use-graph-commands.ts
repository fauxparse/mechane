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
// Persistence is *not* wired here. `saveShowGraph` and the mutation surface
// belong to the CRUD slice (#42); this slice makes the edits and their
// inverses, and leaves the `dispatch` seam on `CommandStack` for #42 to
// attach the server to. Undo will travel that same seam as an ordinary
// forward command when it does.
import { CommandStack } from "@presence/commands";
import type { Gesture, ShowGraphCommand } from "@presence/commands";
import type { ShowGraph } from "@presence/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { toShowGraph } from "./api-graph";
import type { ApiGraph } from "./api-graph";

export interface GraphCommands {
  /** The graph as edited — what the editor draws. */
  graph: ShowGraph;
  /** Applies one command as one undo entry. */
  execute(command: ShowGraphCommand): void;
  /**
   * Opens (or joins) a continuous gesture — a drag, a rename being typed.
   * Every update inside it lands as a single undo entry when it commits (#28).
   */
  beginGesture(options: { key: string; label: string }): Gesture<ShowGraph>;
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
export function useGraphCommands(source: ApiGraph | null | undefined): GraphCommands {
  const [graph, setGraph] = useState<ShowGraph>(() => toShowGraph(source));
  // Bumped whenever something changes that isn't visible in `graph` itself —
  // a gesture committing lands an entry without moving the state, and the
  // undo button has to notice.
  const [, setRevision] = useState(0);

  const stack = useMemo(
    () => new CommandStack<ShowGraph>({ state: toShowGraph(source), onChange: setGraph }),
    // Deliberately built from the first `source` only: replacing it later is
    // `reset`'s job below, so the stack instance (and the gesture that may be
    // open on it) survives a refetch that changes nothing.
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
    (options: { key: string; label: string }): Gesture<ShowGraph> => {
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
