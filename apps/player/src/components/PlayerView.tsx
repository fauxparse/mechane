import { CanvasRenderer, prepareCanvasPresentation } from "@mechane/rendering";
import { useCallback, useMemo } from "react";
import { usePlayerSession, type PlayerSession } from "../api";
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
  onElementTap: (elementId: string) => void;
}) {
  const presentation = useMemo(() => {
    if (!session.canvas || !session.scene || !session.run) return null;
    return prepareCanvasPresentation({
      canvas: session.canvas,
      graph: session.graph,
      blocks: session.blocks ?? [],
      imageAssets: session.imageAssets,
      owner: { kind: "scene", scene: session.scene, sourceValues: session.run.sourceValues },
      mode: "player",
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

export function PlayerView({ code }: { code: string }) {
  const state = usePlayerSession(code);
  const handleElementTap = useCallback(
    (elementId: string) => {
      if (
        state.status !== "ready" ||
        !state.submitEvent ||
        !state.session.scene ||
        !state.session.canvas
      ) {
        return;
      }
      const binding = (state.session.graph.eventBindings ?? []).find(
        (candidate) =>
          candidate.canvasId === state.session.canvas?.id &&
          candidate.elementId === elementId &&
          candidate.eventKind === "tap",
      );
      if (!binding) return;
      void state
        .submitEvent({
          eventId: crypto.randomUUID(),
          publishedGraphVersion: state.session.graph.version,
          sceneId: state.session.scene.id,
          elementId,
          eventKind: "tap",
        })
        .catch(() => undefined);
    },
    [state],
  );

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
  return <PlayerCanvas session={state.session} onElementTap={handleElementTap} />;
}
