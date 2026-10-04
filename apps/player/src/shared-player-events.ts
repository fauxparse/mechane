import type {
  BlockInstancePathSegment,
  RuntimeEventObservation,
} from "@mechane/domain/interactions";
import { useCallback, useMemo, useState } from "react";

import type { PlayerSession, PlayerState } from "./api";
import { dispatchSharedPlayerEvent } from "./player-event-dispatch";
import {
  displayedShowState,
  resolvePendingShowEvent,
  settlePendingShowEvents,
  type PendingShowEvent,
} from "./player-state";

/** The pending Events of one Run of one publication. */
type PendingQueue = { readonly scope: string | null; readonly events: readonly PendingShowEvent[] };

const NO_EVENTS: readonly PendingShowEvent[] = [];

/** A Shared Device's session as this connection shows it, and its Event handlers. */
export interface SharedPlayerEvents {
  /** Null unless a Shared Device's session is ready. */
  readonly session: PlayerSession | null;
  readonly onElementTap: (
    elementId: string,
    slotInstancePath: readonly BlockInstancePathSegment[],
  ) => void;
  readonly onKeyPress: (key: string) => boolean;
}

/**
 * A Shared Device's session as this connection shows it, and the handlers
 * that submit its Events.
 *
 * Its own writes show before the server confirms them (#887): each one waits
 * in an in-memory queue, replayed over every snapshot until a snapshot holds
 * it, as a per-connection Player's Show writes do (#886). The snapshot is
 * the Device's whole state, so another connection to the same Device sees
 * the write when the snapshot reaches it.
 */
export function useSharedPlayerEvents(baseState: PlayerState): SharedPlayerEvents {
  const session =
    baseState.status === "ready" && !baseState.session.device.perConnection
      ? baseState.session
      : null;
  const submitEvent = baseState.submitEvent;
  // An Event predicted against another Run or publication is not this one's:
  // the server rejects it, and its writes name values this Run never had.
  const scope = session?.run ? `${session.run.id}:${session.graphVersion}` : null;
  const [queue, setQueue] = useState<PendingQueue>({ scope: null, events: NO_EVENTS });
  const pending = queue.scope === scope ? queue.events : NO_EVENTS;

  const displayed = useMemo((): PlayerSession | null => {
    if (!session?.run || pending.length === 0) return session;
    const run = session.run;
    return {
      ...session,
      run: { ...run, ...displayedShowState(session.graph, run, run.stateSequence, pending) },
    };
  }, [session, pending]);

  const dispatch = useCallback(
    (observe: (sceneId: string, canvasId: string) => RuntimeEventObservation): boolean => {
      if (!displayed?.run || !displayed.scene || !displayed.canvas || !submitEvent) return false;
      const eventScope = scope;
      const heldSequence = displayed.run.stateSequence;
      return dispatchSharedPlayerEvent({
        graph: displayed.graph,
        canvas: displayed.canvas,
        blocks: displayed.blocks ?? [],
        state: displayed.run,
        observation: observe(displayed.scene.id, displayed.canvas.id),
        publishedGraphVersion: displayed.graphVersion,
        submitEvent,
        onPending: (event) =>
          setQueue((current) => ({
            scope: eventScope,
            events: [
              ...settlePendingShowEvents(
                current.scope === eventScope ? current.events : NO_EVENTS,
                heldSequence,
              ),
              event,
            ],
          })),
        onSettled: (eventId, outcome) =>
          setQueue((current) =>
            current.scope === eventScope
              ? {
                  scope: eventScope,
                  events: resolvePendingShowEvent(current.events, eventId, outcome),
                }
              : current,
          ),
      });
    },
    [displayed, scope, submitEvent],
  );

  const onElementTap = useCallback(
    (elementId: string, slotInstancePath: readonly BlockInstancePathSegment[]) => {
      dispatch((sceneId, canvasId) => ({
        sceneId,
        canvasId,
        elementId,
        eventKind: "tap",
        slotInstancePath,
      }));
    },
    [dispatch],
  );

  /** Keypress binds to the Canvas root — that is how Canvas scope is spelled. */
  const onKeyPress = useCallback(
    (key: string) =>
      dispatch((sceneId, canvasId) => ({
        sceneId,
        canvasId,
        elementId: displayed?.canvas?.root.id ?? "",
        eventKind: "keypress",
        params: { key },
      })),
    [dispatch, displayed],
  );

  return { session: displayed, onElementTap, onKeyPress };
}
