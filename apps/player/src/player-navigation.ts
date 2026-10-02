import { resolveCueParameters } from "@mechane/domain/cue-parameters";
import type {
  BlockInstancePathSegment,
  RuntimeEventObservation,
} from "@mechane/domain/interactions";
import { composeInstanceView } from "@mechane/domain/structured-values";
import { resolvePlayerEvent } from "./player-event-dispatch";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/**
 * Where this connection's Instance store stands. The session it renders is
 * composed from this and the latest Show state on every render, so a change
 * to the Run's values reaches the Canvas without reopening the store (#881).
 */
type NavigationState =
  | { status: "inactive" | "loading" | "unwired" }
  | {
      status: "superseded" | "not-ready" | "playing";
      store: PlayerStateStore;
      instance: PlayerRunState;
    };

function settled(store: PlayerStateStore, instance: PlayerRunState): NavigationState {
  return {
    status: instance.navigation.kind === "scene" ? "playing" : "not-ready",
    store,
    instance,
  };
}

export function usePlayerNavigation(
  baseState: PlayerState,
  pairingCode: string,
): NavigationRuntime & {
  onElementTap: (elementId: string, slotInstancePath: readonly BlockInstancePathSegment[]) => void;
  onKeyPress: (key: string) => boolean;
  onTakeOver: () => void;
} {
  const [navigation, setNavigation] = useState<NavigationState>({ status: "inactive" });
  const session = baseState.status === "ready" ? baseState.session : null;
  // What the store depends on. A run-state refresh replaces the session's Run
  // values and keeps these, so it never reopens the store.
  const runId = session?.run?.id ?? null;
  const flow = session?.flow ?? null;
  const graph = session?.graph ?? null;
  const graphVersion = session?.graphVersion ?? null;

  useEffect(() => {
    if (!graph || graphVersion === null) {
      setNavigation({ status: "inactive" });
      return;
    }
    if (!runId) {
      clearPlayerDeviceState(pairingCode);
      setNavigation({ status: "loading" });
      return;
    }
    if (!flow) {
      setNavigation({ status: "unwired" });
      return;
    }
    const scope = playerRunScope(pairingCode, runId);
    const store = openPlayerStateStore(scope);
    const flowSourceIds = new Set<string>();
    for (const node of graph.nodes) {
      if (node.kind === "source" && node.parentId === flow.flowId) {
        flowSourceIds.add(node.id);
      }
    }
    const driver = {
      kind: "flow",
      flowId: flow.flowId,
      defaultSceneId: flow.defaultSceneId,
      sceneIds: new Set(flow.scenes.map(({ scene }) => scene.id)),
      flowSourceIds,
      publishedGraphVersion: graphVersion,
    } satisfies PlayerDriver;
    const reconciliation = reconcilePlayerRunState(store.read(), driver);
    if (reconciliation.kind === "stale-snapshot") {
      setNavigation({ status: "loading" });
      store.close();
      return;
    }
    if (reconciliation.kind === "discard") {
      setNavigation({ status: "unwired" });
      store.close();
      return;
    }
    const playerState = initializePlayerInstanceState(reconciliation.state, graph);
    store.replace(playerState);
    store.claim();
    setNavigation(settled(store, playerState));
    const unsubscribe = store.subscribe(() => {
      if (store.getStatus().ownership === "superseded") {
        setNavigation({ status: "superseded", store, instance: playerState });
      }
    });
    return () => {
      unsubscribe();
      store.close();
    };
  }, [pairingCode, runId, flow, graph, graphVersion]);

  const runtime = useMemo((): NavigationRuntime => {
    if (!session) return { status: "inactive", session: null };
    switch (navigation.status) {
      case "inactive":
      case "loading":
        return { status: navigation.status, session };
      case "unwired":
        return { status: "unwired", session, store: null };
      default:
        return {
          status: navigation.status,
          session: sessionForState(session, navigation.instance),
          store: navigation.store,
        };
    }
  }, [navigation, session]);

  // One local resolver for both kinds: a keypress differs only in what it
  // observes, never in how the resolved plan is applied.
  const retryEventId = useRef<string | null>(null);
  const navigateFor = useCallback(
    (observe: (sceneId: string, canvasId: string) => RuntimeEventObservation): boolean => {
      if (
        runtime.status !== "playing" ||
        navigation.status !== "playing" ||
        !runtime.session.scene ||
        !runtime.session.canvas
      ) {
        return false;
      }
      const store = navigation.store;
      if (store.getStatus().ownership !== "active") {
        setNavigation({ ...navigation, status: "superseded" });
        return false;
      }
      const observation = observe(runtime.session.scene.id, runtime.session.canvas.id);
      const plan = resolvePlayerEvent(runtime.session.graph, observation);
      if (plan.kind !== "planned") return false;
      const currentState = store.read();
      if (!currentState) return false;
      // The base session, never the runtime one: `sessionForState` has already
      // composed the Instance layer into that, and composing it twice would
      // hide a Source the current Instance state no longer has.
      const baseRun = baseState.status === "ready" ? baseState.session.run : null;
      const showState = {
        sourceValues: baseRun?.sourceValues ?? {},
        structuredValues: baseRun?.structuredValues ?? {},
      };
      // Show scope and Instance scope composed as ADR-0018 requires, so a
      // Parameter relayed out of a Slot carries the reference the Player
      // rendered rather than a copy of the value.
      const parameters = resolveCueParameters({
        graph: runtime.session.graph,
        canvas: runtime.session.canvas,
        sceneId: plan.sceneId,
        state: composeInstanceView(showState, {
          sourceValues: currentState.flowSourceValues,
          structuredValues: currentState.flowStructuredValues,
        }),
        blocks: runtime.session.blocks ?? [],
        parameters: plan.parameters,
        transformerRuntime: { shuffleSeeds: currentState.shuffleSeeds ?? {} },
      });
      if (parameters.kind !== "resolved") return false;
      const target = plan.actions.find(
        (action) =>
          action.kind === "navigate" &&
          runtime.session.flow?.scenes.some(({ scene }) => scene.id === action.targetSceneId),
      );
      const eventId = retryEventId.current ?? crypto.randomUUID();
      const execution = applyPlayerCue(
        currentState,
        runtime.session.graph,
        plan.actions,
        plan.sceneId,
        eventId,
        parameters.values,
        showState,
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
        publishedGraphVersion: runtime.session.graphVersion,
      };
      if (!store.replace(nextState)) {
        setNavigation({ ...navigation, status: "superseded" });
        return false;
      }
      setNavigation(settled(store, nextState));
      const reachesShow = Object.keys(execution.evidence).length > 0;
      if (reachesShow) retryEventId.current = eventId;
      // Built field by field rather than spread from the observation: the
      // observation carries `canvasId`, which `PlayerEventInput` does not
      // declare, and an undeclared input field makes the server reject the
      // whole argument — reported, unhelpfully, as a null `input`.
      const submission = baseState.submitEvent?.({
        eventId,
        publishedGraphVersion: runtime.session.graphVersion,
        sceneId: plan.sceneId,
        elementId: observation.elementId,
        slotInstancePath: observation.slotInstancePath ?? [],
        ...(observation.eventKind === "keypress"
          ? { eventKind: "keypress" as const, params: observation.params }
          : { eventKind: "tap" as const }),
        ...(reachesShow ? { evidence: execution.evidence } : {}),
      });
      if (submission && reachesShow) {
        void submission
          .then((result) => {
            if (result.kind !== "failed" && result.kind !== "rejected") {
              retryEventId.current = null;
              return;
            }
            if (store.replace(currentState)) setNavigation(settled(store, currentState));
          })
          .catch(() => {
            if (store.replace(currentState)) setNavigation(settled(store, currentState));
          });
      } else {
        void submission?.catch(() => undefined);
      }
      return true;
    },
    [baseState, navigation, runtime],
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
    if (navigation.status !== "superseded") return;
    navigation.store.takeOver();
    const currentState = navigation.store.read();
    if (currentState) setNavigation(settled(navigation.store, currentState));
  }, [navigation]);

  return { ...runtime, onElementTap, onKeyPress, onTakeOver };
}

/**
 * The session as the renderer should see it: the chosen Scene, and Show scope
 * composed with this connection's Instance scope.
 *
 * ADR-0018 keeps the two layers apart in storage, so `run` alone carries only
 * what the server owns. A Scene Variable wired to a Flow-local Source reads as
 * empty until they are composed, which is what left the confirmation Screen
 * with no Candidate on it.
 */
function sessionForState(session: PlayerSession, state: PlayerRunState): PlayerSession {
  const navigation = state.navigation;
  const composed = session.run
    ? {
        ...session,
        run: {
          ...session.run,
          ...composeInstanceView(
            {
              sourceValues: session.run.sourceValues,
              structuredValues: session.run.structuredValues,
            },
            {
              sourceValues: state.flowSourceValues,
              structuredValues: state.flowStructuredValues,
            },
          ),
          shuffleSeeds: state.shuffleSeeds ?? {},
        },
      }
    : session;
  if (!session.flow || navigation.kind !== "scene") {
    return { ...composed, scene: null, canvas: null };
  }
  const selected = session.flow.scenes.find(({ scene }) => scene.id === navigation.sceneId);
  if (!selected) return { ...composed, scene: null, canvas: null };
  return { ...composed, scene: selected.scene, canvas: selected.canvas };
}
