import {
  composeInstanceView,
  resolveCueParameters,
  resolveRuntimeEvent,
  type BlockInstancePathSegment,
  type RuntimeEventObservation,
} from "@mechane/domain";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerSession, PlayerState } from "./api";
import {
  applyPlayerCue,
  clearPlayerDeviceState,
  initializePlayerInstanceState,
  openPlayerStateStore,
  playerRunScope,
  reconcilePlayerRunState,
  type PlayerDriver,
  type PlayerRunState,
  type PlayerStateStore,
} from "./player-state";

type NavigationRuntime =
  | { status: "inactive"; session: PlayerSession | null }
  | { status: "loading"; session: PlayerSession }
  | { status: "superseded"; session: PlayerSession; store: PlayerStateStore }
  | {
      status: "not-ready" | "unwired" | "playing";
      session: PlayerSession;
      store: PlayerStateStore | null;
    };

export function usePlayerNavigation(
  baseState: PlayerState,
  pairingCode: string,
): NavigationRuntime & {
  onElementTap: (elementId: string, slotInstancePath: readonly BlockInstancePathSegment[]) => void;
  onKeyPress: (key: string) => boolean;
  onTakeOver: () => void;
} {
  const [runtime, setRuntime] = useState<NavigationRuntime>({ status: "inactive", session: null });
  const session = baseState.status === "ready" ? baseState.session : null;

  useEffect(() => {
    if (!session) {
      setRuntime({ status: "inactive", session: null });
      return;
    }
    if (!session.run) {
      clearPlayerDeviceState(pairingCode);
      setRuntime({ status: "loading", session });
      return;
    }
    if (!session.flow) {
      setRuntime({ status: "unwired", session, store: null });
      return;
    }
    const scope = playerRunScope(pairingCode, session.run.id);
    const store = openPlayerStateStore(scope);
    const driver = {
      kind: "flow",
      flowId: session.flow.flowId,
      defaultSceneId: session.flow.defaultSceneId,
      sceneIds: new Set(session.flow.scenes.map(({ scene }) => scene.id)),
      flowSourceIds: new Set(
        session.graph.nodes
          .filter((node) => node.kind === "source" && node.parentId === session.flow?.flowId)
          .map((node) => node.id),
      ),
      publishedGraphVersion: session.graph.version,
    } satisfies PlayerDriver;
    const reconciliation = reconcilePlayerRunState(store.read(), driver);
    if (reconciliation.kind === "stale-snapshot") {
      setRuntime({ status: "loading", session });
      store.close();
      return;
    }
    if (reconciliation.kind === "discard") {
      setRuntime({ status: "unwired", session, store: null });
      store.close();
      return;
    }
    const playerState = initializePlayerInstanceState(reconciliation.state, session.graph);
    store.replace(playerState);
    store.claim();
    setRuntime({
      status: playerState.navigation.kind === "scene" ? "playing" : "not-ready",
      session: sessionForState(session, playerState),
      store,
    });
    const unsubscribe = store.subscribe(() => {
      if (store.getStatus().ownership === "superseded") {
        setRuntime({
          status: "superseded",
          session: sessionForState(session, playerState),
          store,
        });
      }
    });
    return () => {
      unsubscribe();
      store.close();
    };
  }, [pairingCode, session]);

  // One local resolver for both kinds: a keypress differs only in what it
  // observes, never in how the resolved plan is applied.
  const retryEventId = useRef<string | null>(null);
  const navigateFor = useCallback(
    (observe: (sceneId: string, canvasId: string) => RuntimeEventObservation): boolean => {
      if (
        runtime.status !== "playing" ||
        !runtime.store ||
        !runtime.session.scene ||
        !runtime.session.canvas
      ) {
        return false;
      }
      if (runtime.store.getStatus().ownership !== "active") {
        setRuntime({ status: "superseded", session: runtime.session, store: runtime.store });
        return false;
      }
      const observation = observe(runtime.session.scene.id, runtime.session.canvas.id);
      const plan = resolveRuntimeEvent(runtime.session.graph, observation);
      if (plan.kind !== "planned") return false;
      const currentState = runtime.store.read();
      if (!currentState) return false;
      // Show scope and Instance scope composed as ADR-0018 requires, so a
      // Parameter relayed out of a Slot carries the reference the Player
      // rendered rather than a copy of the value.
      const parameters = resolveCueParameters({
        graph: runtime.session.graph,
        canvas: runtime.session.canvas,
        sceneId: plan.sceneId,
        state: composeInstanceView(
          {
            sourceValues: runtime.session.run?.sourceValues ?? {},
            structuredValues: runtime.session.run?.structuredValues ?? {},
          },
          {
            sourceValues: currentState.flowSourceValues,
            structuredValues: currentState.flowStructuredValues,
          },
        ),
        blocks: runtime.session.blocks ?? [],
        parameters: plan.parameters,
      });
      if (parameters.kind !== "resolved") return false;
      const target = plan.actions.find(
        (action) =>
          action.kind === "navigate" &&
          runtime.session.flow?.scenes.some(({ scene }) => scene.id === action.targetSceneId),
      );
      const execution = applyPlayerCue(
        currentState,
        runtime.session.graph,
        plan.actions,
        plan.sceneId,
        parameters.values,
      );
      if (execution.kind === "failed") return false;
      if (
        target &&
        target.kind === "navigate" &&
        !runtime.session.flow?.scenes.some(({ scene }) => scene.id === target.targetSceneId)
      ) {
        return false;
      }
      const nextState: PlayerRunState = {
        ...execution.state,
        publishedGraphVersion: runtime.session.graph.version,
      };
      if (!runtime.store.replace(nextState)) {
        setRuntime({ status: "superseded", session: runtime.session, store: runtime.store });
        return false;
      }
      setRuntime({
        status: "playing",
        session: sessionForState(runtime.session, nextState),
        store: runtime.store,
      });
      const eventId = retryEventId.current ?? crypto.randomUUID();
      if (execution.showActions.length > 0) retryEventId.current = eventId;
      const submission = baseState.submitEvent?.({
        ...observation,
        eventId,
        publishedGraphVersion: runtime.session.graph.version,
        sceneId: plan.sceneId,
        ...(execution.showActions.length > 0
          ? {
              evidence: {
                sourceValues: nextState.flowSourceValues,
                cueParameters: parameters.values,
              },
            }
          : {}),
      });
      if (submission && execution.showActions.length > 0) {
        void submission
          .then((result) => {
            if (result.kind !== "failed" && result.kind !== "rejected") {
              retryEventId.current = null;
              return;
            }
            if (runtime.store?.replace(currentState)) {
              setRuntime({
                status: currentState.navigation.kind === "scene" ? "playing" : "not-ready",
                session: sessionForState(runtime.session, currentState),
                store: runtime.store,
              });
            }
          })
          .catch(() => {
            if (runtime.store?.replace(currentState)) {
              setRuntime({
                status: currentState.navigation.kind === "scene" ? "playing" : "not-ready",
                session: sessionForState(runtime.session, currentState),
                store: runtime.store,
              });
            }
          });
      } else {
        void submission?.catch(() => undefined);
      }
      return true;
    },
    [baseState, runtime],
  );

  const onElementTap = useCallback(
    (elementId: string, slotInstancePath: readonly BlockInstancePathSegment[]) => {
      navigateFor((sceneId, canvasId) => ({
        sceneId,
        canvasId,
        elementId,
        eventKind: "tap",
        slotInstancePath,
      }));
    },
    [navigateFor],
  );

  /** Keypress binds to the Canvas root — that is how Canvas scope is spelled. */
  const onKeyPress = useCallback(
    (key: string) =>
      navigateFor((sceneId, canvasId) => ({
        sceneId,
        canvasId,
        elementId: runtime.session?.canvas?.root.id ?? "",
        eventKind: "keypress",
        params: { key },
      })),
    [navigateFor, runtime],
  );

  const onTakeOver = useCallback(() => {
    if (runtime.status !== "superseded") return;
    runtime.store.takeOver();
    const currentState = runtime.store.read();
    if (!currentState) return;
    setRuntime({
      status: currentState.navigation.kind === "scene" ? "playing" : "not-ready",
      session: sessionForState(runtime.session, currentState),
      store: runtime.store,
    });
  }, [runtime]);

  return { ...runtime, onElementTap, onKeyPress, onTakeOver };
}

function sessionForState(session: PlayerSession, state: PlayerRunState): PlayerSession {
  const navigation = state.navigation;
  if (!session.flow || navigation.kind !== "scene") {
    return { ...session, scene: null, canvas: null };
  }
  const selected = session.flow.scenes.find(({ scene }) => scene.id === navigation.sceneId);
  if (!selected) return { ...session, scene: null, canvas: null };
  return { ...session, scene: selected.scene, canvas: selected.canvas };
}
