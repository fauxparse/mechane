import type { BlockInstancePathSegment } from "@mechane/domain/interactions";
import { CanvasRenderer, prepareCanvasPresentation } from "@mechane/rendering";
import { useMemo } from "react";
import { usePlayerSession, type PlayerSession } from "../api";
import { PLAYER_ORIGIN } from "../player-origin";
import { usePlayerKeypress } from "../player-keypress";
import { usePlayerNavigation } from "../player-navigation";
import { useSharedPlayerEvents, type SharedPlayerEvents } from "../shared-player-events";
import { SplashScreen } from "./join/SplashScreen";
function WaitingForRun({ session }: { session: PlayerSession }) {
  return (
    <SplashScreen>
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl bg-white/25 p-7 text-center shadow-xl inset-shadow-[0_1px_0_0_white]">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-700">Connected</p>
        <h1 className="text-3xl font-semibold text-neutral-950">{session.device.name}</h1>
        <p className="text-neutral-800">Waiting for the show to start.</p>
      </div>
    </SplashScreen>
  );
}

function PlayerCanvas({
  session,
  onElementTap,
}: {
  session: PlayerSession;
  onElementTap: (elementId: string, slotInstancePath: readonly BlockInstancePathSegment[]) => void;
}) {
  const presentation = useMemo(() => {
    if (!session.canvas || !session.scene || !session.run) return null;
    return prepareCanvasPresentation({
      canvas: session.canvas,
      graph: session.graph,
      blocks: session.blocks ?? [],
      imageAssets: session.imageAssets,
      owner: {
        kind: "scene",
        scene: session.scene,
        sourceValues: session.run.sourceValues,
        structuredValues: session.run.structuredValues,
        shuffleSeeds: session.run.shuffleSeeds ?? {},
      },
      mode: "player",
      playerOrigin: PLAYER_ORIGIN,
    });
  }, [session]);

  if (!presentation) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-neutral-950 p-6 text-center text-white">
        <p>This Device is connected, but its published Scene is not ready.</p>
      </div>
    );
  }

  return (
    <main
      className="fixed inset-0 overflow-hidden bg-black"
      aria-label={session.scene?.name ?? "Player view"}
    >
      <CanvasRenderer
        presentation={presentation}
        className="h-full w-full"
        imageLoading="eager"
        onElementTap={onElementTap}
      />
    </main>
  );
}

function SupersededScreen({ onTakeOver }: { onTakeOver: () => void }) {
  return (
    <SplashScreen>
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl bg-white/25 p-7 text-center shadow-xl inset-shadow-[0_1px_0_0_white]">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-700">
          Already open
        </p>
        <h1 className="text-2xl font-semibold text-neutral-950">
          This Device is open in another tab
        </h1>
        <button
          className="rounded-lg bg-neutral-950 px-4 py-2 font-medium text-white"
          type="button"
          onClick={onTakeOver}
        >
          Use this tab instead
        </button>
      </div>
    </SplashScreen>
  );
}

export function PlayerView({ code }: { code: string }) {
  const state = usePlayerSession(code);
  const navigation = usePlayerNavigation(state, code);
  const shared = useSharedPlayerEvents(state);

  const perConnection = state.status === "ready" && state.session.device.perConnection;
  usePlayerKeypress(
    state.status === "ready" && Boolean(state.session.run),
    perConnection ? navigation.onKeyPress : shared.onKeyPress,
  );

  return <PlayerStatusView state={state} navigation={navigation} shared={shared} />;
}

type PlayerStatusViewProps = {
  state: ReturnType<typeof usePlayerSession>;
  navigation: ReturnType<typeof usePlayerNavigation>;
  shared: SharedPlayerEvents;
};

function PlayerStatusView({ state, navigation, shared }: PlayerStatusViewProps) {
  if (state.status === "idle" || state.status === "loading") {
    return (
      <SplashScreen>
        <p className="rounded-xl bg-white/25 px-6 py-4 text-lg text-neutral-900 shadow-xl">
          Connecting…
        </p>
      </SplashScreen>
    );
  }

  if (state.status === "error") {
    return (
      <SplashScreen>
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl bg-white/25 p-7 text-center shadow-xl inset-shadow-[0_1px_0_0_white]">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-700">
            {state.notFound ? "Pairing failed" : "Connection failed"}
          </p>
          <h1 className="text-2xl font-semibold text-neutral-950">
            {state.notFound ? "Check your code" : "Try again"}
          </h1>
          <p className="text-neutral-800">{state.message}</p>
        </div>
      </SplashScreen>
    );
  }

  if (!state.session.run) return <WaitingForRun session={state.session} />;
  if (!state.session.device.perConnection) {
    return (
      <PlayerCanvas session={shared.session ?? state.session} onElementTap={shared.onElementTap} />
    );
  }
  if (navigation.status === "inactive" && state.session.scene && state.session.canvas) {
    return <PlayerCanvas session={state.session} onElementTap={navigation.onElementTap} />;
  }
  if (navigation.status === "loading" || navigation.status === "inactive") {
    return (
      <SplashScreen>
        <p className="rounded-xl bg-white/25 px-6 py-4 text-lg text-neutral-900 shadow-xl">
          Connecting…
        </p>
      </SplashScreen>
    );
  }
  if (navigation.status === "superseded") {
    return <SupersededScreen onTakeOver={navigation.onTakeOver} />;
  }
  return <PlayerCanvas session={navigation.session} onElementTap={navigation.onElementTap} />;
}
