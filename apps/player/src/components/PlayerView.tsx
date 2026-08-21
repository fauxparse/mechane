import { CanvasRenderer } from "@mechane/rendering";
import { resolveCanvasProperties } from "@mechane/domain";
import { useMemo } from "react";
import { usePlayerSession, type PlayerSession } from "../api";
import { sceneVariableValues } from "../player-state";
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

function PlayerCanvas({ session }: { session: PlayerSession }) {
  const canvas = useMemo(() => {
    if (!session.canvas || !session.scene || !session.run) return null;
    const values = sceneVariableValues(session.graph, session.scene.id, session.run.sourceValues);
    return resolveCanvasProperties(session.canvas, {
      graph: session.graph,
      variables: session.scene.variables,
      values,
      shapes: session.graph.shapes,
      imageAssets: session.imageAssets,
    });
  }, [session]);

  if (!canvas) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-neutral-950 p-6 text-center text-white">
        <p>This Device is connected, but its published Scene is not ready.</p>
      </div>
    );
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-black" aria-label={session.scene?.name ?? "Player view"}>
      <CanvasRenderer canvas={canvas} className="h-full w-full" imageLoading="eager" />
    </main>
  );
}

export function PlayerView({ code }: { code: string }) {
  const state = usePlayerSession(code);

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
  return <PlayerCanvas session={state.session} />;
}
