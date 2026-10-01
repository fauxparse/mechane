import { describe, expect, it } from "vitest";

import type { ReceivedShowEvent } from "../../api/show-events";
import {
  NO_START_RUN_PROMPT,
  nextStartRunPrompt,
  WAITING_NOTICE_TTL_MS,
  type StartRunPromptAction,
  type StartRunPromptState,
} from "./start-run-prompt";

const now = new Date("2026-10-01T12:00:00Z");

function received(event: ReceivedShowEvent["event"], publishedAt = now): StartRunPromptAction {
  return { kind: "received", received: { event, publishedAt }, receivedAt: now };
}

function waiting(deviceId: string, deviceName = deviceId, publishedAt = now) {
  return received({ type: "device.waiting", payload: { deviceId, deviceName } }, publishedAt);
}

function run(...actions: StartRunPromptAction[]): StartRunPromptState {
  return actions.reduce(nextStartRunPrompt, NO_START_RUN_PROMPT);
}

describe("nextStartRunPrompt", () => {
  it("names each waiting Device once, in the order they connected", () => {
    const state = run(waiting("foyer", "Foyer screen"), waiting("phones"), waiting("foyer"));

    expect(state.waiting).toEqual([
      { id: "foyer", name: "Foyer screen" },
      { id: "phones", name: "phones" },
    ]);
  });

  it("ignores a notice older than the replay window", () => {
    const stale = new Date(now.getTime() - WAITING_NOTICE_TTL_MS - 1);

    expect(run(waiting("foyer", "Foyer", stale)).waiting).toEqual([]);
  });

  it("does not ask again about a Device the director declined, but asks about a new one", () => {
    const state = run(waiting("foyer"), { kind: "declined" }, waiting("foyer"), waiting("phones"));

    expect(state.waiting.map((device) => device.id)).toEqual(["phones"]);
  });

  it("asks about a declined Device again once a Run has come and gone", () => {
    const state = run(
      waiting("foyer"),
      { kind: "declined" },
      received({ type: "run.started", payload: { runId: "run_1" } }),
      received({ type: "run.ended", payload: { runId: "run_1" } }),
      waiting("foyer"),
    );

    expect(state.waiting.map((device) => device.id)).toEqual(["foyer"]);
  });

  it("closes the question when a Run starts from anywhere", () => {
    const state = run(
      waiting("foyer"),
      received({ type: "run.started", payload: { runId: "run_1" } }),
    );

    expect(state).toEqual(NO_START_RUN_PROMPT);
  });
});
