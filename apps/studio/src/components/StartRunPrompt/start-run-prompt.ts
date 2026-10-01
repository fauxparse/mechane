// Which waiting Devices the start-the-show prompt is asking about (issue #467).
//
// A Device that connects to a Show with no Run sits on "waiting for the show
// to start" until someone goes live, and nothing in Studio said so. The API
// announces each such connection on the Show's channel; this decides which of
// those announcements are worth asking about.
import type { ReceivedShowEvent } from "../../api/show-events";

export type WaitingDevice = { id: string; name: string };

export type StartRunPromptState = {
  /** Devices the open prompt names, in the order they connected. */
  waiting: readonly WaitingDevice[];
  /** Devices the director said "not now" to. Asked again after the next Run. */
  declined: ReadonlySet<string>;
};

export const NO_START_RUN_PROMPT: StartRunPromptState = { waiting: [], declined: new Set() };

/**
 * How old a waiting notice may be and still prompt. The development realtime
 * adapter replays its history to every new subscriber (ADR-0003), so without
 * a limit each reload of a stopped Show would ask about Devices that came and
 * went long ago. Loose enough to absorb drift between API and browser clocks.
 */
export const WAITING_NOTICE_TTL_MS = 60_000;

export type StartRunPromptAction =
  | { kind: "received"; received: ReceivedShowEvent; receivedAt: Date }
  | { kind: "accepted" }
  | { kind: "declined" };

export function nextStartRunPrompt(
  state: StartRunPromptState,
  action: StartRunPromptAction,
): StartRunPromptState {
  switch (action.kind) {
    case "accepted":
      return NO_START_RUN_PROMPT;
    case "declined":
      return {
        waiting: [],
        declined: new Set([...state.declined, ...state.waiting.map((device) => device.id)]),
      };
    case "received": {
      const { event, publishedAt } = action.received;
      switch (event.type) {
        // Whoever started it, a Run answers the question for every Device.
        case "run.started":
          return NO_START_RUN_PROMPT;
        case "run.ended":
          return state;
        case "device.waiting": {
          const { deviceId, deviceName } = event.payload;
          if (action.receivedAt.getTime() - publishedAt.getTime() > WAITING_NOTICE_TTL_MS) {
            return state;
          }
          if (
            state.declined.has(deviceId) ||
            state.waiting.some((device) => device.id === deviceId)
          ) {
            return state;
          }
          return { ...state, waiting: [...state.waiting, { id: deviceId, name: deviceName }] };
        }
        default: {
          const _exhaustive: never = event;
          return _exhaustive;
        }
      }
    }
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
