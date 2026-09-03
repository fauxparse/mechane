import { resolveRuntimeEvent, type RuntimeEventObservation } from "@mechane/domain";
import { useCallback, useEffect, useState } from "react";
import type { PlayerSession, PlayerState } from "./api";
import {
  clearPlayerDeviceState,
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
  onElementTap: (elementId: string) => void;
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
    store.replace(reconciliation.state);
    store.claim();
    setRuntime({
      status: reconciliation.state.navigation.kind === "scene" ? "playing" : "not-ready",
      session: sessionForState(session, reconciliation.state),
      store,
    });
    const unsubscribe = store.subscribe(() => {
      if (store.getStatus().ownership === "superseded") {
        setRuntime({
          status: "superseded",
          session: sessionForState(session, reconciliation.state),
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
      const action = plan.actions[0];
      if (!action || action.kind !== "navigate") return false;
      const target = runtime.session.flow?.scenes.find(
        ({ scene }) => scene.id === action.targetSceneId,
      );
      const currentState = runtime.store.read();
      if (!target || !currentState) return false;
      const nextState: PlayerRunState = {
        ...currentState,
        publishedGraphVersion: runtime.session.graph.version,
        navigation: { kind: "scene", sceneId: target.scene.id },
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
      void baseState
        .submitEvent?.({
          ...observation,
          eventId: crypto.randomUUID(),
          publishedGraphVersion: runtime.session.graph.version,
          sceneId: plan.sceneId,
        })
        .catch(() => undefined);
      return true;
    },
    [baseState, runtime],
  );

  const onElementTap = useCallback(
    (elementId: string) => {
      navigateFor((sceneId, canvasId) => ({
        sceneId,
        canvasId,
        elementId,
        eventKind: "tap",
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
