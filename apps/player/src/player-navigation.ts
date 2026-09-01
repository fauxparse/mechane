import { resolveRuntimeEvent } from "@mechane/domain";
import { useCallback, useEffect, useState } from "react";
import type { PlayerSession, PlayerState } from "./api";
import {
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
  onTakeOver: () => void;
} {
  const [runtime, setRuntime] = useState<NavigationRuntime>({ status: "inactive", session: null });
  const session = baseState.status === "ready" ? baseState.session : null;

  useEffect(() => {
    if (!session) {
      setRuntime({ status: "inactive", session: null });
      return;
    }
    if (!session.device.perConnection) {
      setRuntime({ status: "inactive", session });
      return;
    }
    if (!session.run || !session.flow) {
      setRuntime({ status: "loading", session });
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
        setRuntime({ status: "superseded", session: sessionForState(session, reconciliation.state), store });
      }
    });
    return () => {
      unsubscribe();
      store.close();
    };
  }, [pairingCode, session]);

  const onElementTap = useCallback(
    (elementId: string) => {
      if (
        runtime.status !== "playing" ||
        !runtime.store ||
        !runtime.session.scene ||
        !runtime.session.canvas
      ) {
        return;
      }
      if (runtime.store.getStatus().ownership !== "active") {
        setRuntime({ status: "superseded", session: runtime.session, store: runtime.store });
        return;
      }
      const plan = resolveRuntimeEvent(runtime.session.graph, {
        sceneId: runtime.session.scene.id,
        canvasId: runtime.session.canvas.id,
        elementId,
        eventKind: "tap",
      });
      if (plan.kind !== "planned") return;
      const action = plan.actions[0];
      if (!action || action.kind !== "navigate") return;
      const target = runtime.session.flow?.scenes.find(({ scene }) => scene.id === action.targetSceneId);
      const currentState = runtime.store.read();
      if (!target || !currentState) return;
      const nextState: PlayerRunState = {
        ...currentState,
        publishedGraphVersion: runtime.session.graph.version,
        navigation: { kind: "scene", sceneId: target.scene.id },
      };
      if (!runtime.store.replace(nextState)) {
        setRuntime({ status: "superseded", session: runtime.session, store: runtime.store });
        return;
      }
      setRuntime({
        status: "playing",
        session: sessionForState(runtime.session, nextState),
        store: runtime.store,
      });
      void baseState.submitEvent?.({
        eventId: crypto.randomUUID(),
        publishedGraphVersion: runtime.session.graph.version,
        sceneId: plan.sceneId,
        elementId,
        eventKind: "tap",
      }).catch(() => undefined);
    },
    [baseState, runtime],
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

  return { ...runtime, onElementTap, onTakeOver };
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
