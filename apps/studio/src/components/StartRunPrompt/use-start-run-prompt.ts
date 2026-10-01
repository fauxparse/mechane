// Asks whoever is editing a stopped Show to start it when a Device connects
// (issue #467). See start-run-prompt.ts for which connections are asked about.
import type { ShowId } from "@mechane/domain/id";
import { useReducer } from "react";

import { useShowEvents } from "../../api/show-events";
import { NO_START_RUN_PROMPT, nextStartRunPrompt, type WaitingDevice } from "./start-run-prompt";

export function useStartRunPrompt({
  showId,
  runActive,
}: {
  showId: ShowId | null;
  runActive: boolean;
}): {
  open: boolean;
  devices: readonly WaitingDevice[];
  accept(): void;
  decline(): void;
} {
  const [state, dispatch] = useReducer(nextStartRunPrompt, NO_START_RUN_PROMPT);
  useShowEvents(showId, (received) =>
    dispatch({ kind: "received", received, receivedAt: new Date() }),
  );
  return {
    // A notice can race a Run started from elsewhere; the Run wins.
    open: state.waiting.length > 0 && !runActive,
    devices: state.waiting,
    accept: () => dispatch({ kind: "accepted" }),
    decline: () => dispatch({ kind: "declined" }),
  };
}
