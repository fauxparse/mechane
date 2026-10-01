import type { RealtimeMessage } from "@mechane/realtime";
import { describe, expect, it } from "vitest";

import type { PlayerSession } from "./api";
import {
  coalesced,
  holdsInvalidatedState,
  mergePlayerRunSnapshot,
  predatesPlayerSession,
  type PlayerRunSnapshot,
  usableRealtimeGrant,
} from "./player-run-refresh";

function session(stateSequence: number, sourceValues = { source_count: 1 }): PlayerSession {
  return {
    device: { name: "Projector", perConnection: false },
    realtime: { channel: "player:test", grant: "grant", expiresAt: "2026-01-01T00:01:00.000Z" },
    sessionKey: "key_1",
    run: {
      id: "run_1",
      showId: "show_1",
      status: "active",
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: null,
      stateSequence,
      sourceValues,
      structuredValues: {},
    },
    graph: { nodes: [], edges: [] },
    graphVersion: 1,
    flow: null,
    scene: null,
    canvas: null,
    blocks: [],
    imageAssets: [],
  };
}

function snapshot(
  stateSequence: number,
  overrides: Partial<PlayerRunSnapshot> = {},
): PlayerRunSnapshot {
  return {
    sessionKey: "key_1",
    stateSequence,
    sourceValues: { source_count: 2 },
    structuredValues: {},
    ...overrides,
  };
}

function invalidation(payload: unknown): RealtimeMessage {
  return { id: "message_1", sequence: 1, type: "player.updated", payload } as RealtimeMessage;
}

describe("mergePlayerRunSnapshot", () => {
  it("replaces the Run's values and keeps everything else the session holds", () => {
    const held = session(4);
    const merge = mergePlayerRunSnapshot(held, snapshot(5));

    expect(merge.kind).toBe("updated");
    if (merge.kind !== "updated") return;
    expect(merge.session.run).toMatchObject({
      stateSequence: 5,
      sourceValues: { source_count: 2 },
    });
    // The navigation hook keys its store on these; a new object would reopen it.
    expect(merge.session.graph).toBe(held.graph);
    expect(merge.session.flow).toBe(held.flow);
  });

  it("ignores a read older than the session, whatever else it says", () => {
    expect(mergePlayerRunSnapshot(session(5), snapshot(4)).kind).toBe("stale");
    expect(mergePlayerRunSnapshot(session(5), snapshot(4, { sessionKey: "key_2" })).kind).toBe(
      "stale",
    );
  });

  it("applies a read at the held sequence only when its values differ", () => {
    expect(mergePlayerRunSnapshot(session(5), snapshot(5)).kind).toBe("updated");
    expect(
      mergePlayerRunSnapshot(session(5), snapshot(5, { sourceValues: { source_count: 1 } })).kind,
    ).toBe("stale");
  });

  it("asks for the whole session when the run-state read cannot stand in for it", () => {
    expect(mergePlayerRunSnapshot(session(4), snapshot(5, { sessionKey: "key_2" })).kind).toBe(
      "session-changed",
    );
    expect(mergePlayerRunSnapshot(session(4), null).kind).toBe("session-changed");
    expect(mergePlayerRunSnapshot({ ...session(4), run: null }, snapshot(5)).kind).toBe(
      "session-changed",
    );
  });

  it("leaves a session waiting for a Run alone until one starts", () => {
    expect(mergePlayerRunSnapshot({ ...session(4), run: null }, null).kind).toBe("stale");
  });
});

describe("predatesPlayerSession", () => {
  it("drops a whole-session read overtaken by a newer one", () => {
    expect(predatesPlayerSession(session(5), session(4))).toBe(true);
    expect(predatesPlayerSession(session(5), session(5))).toBe(false);
    expect(predatesPlayerSession(session(5), { ...session(0), run: null })).toBe(false);
  });
});

describe("usableRealtimeGrant", () => {
  const realtime = {
    channel: "player:test",
    grant: "grant",
    expiresAt: "2026-01-01T00:01:00.000Z",
  };
  const expiresAt = Date.parse(realtime.expiresAt);

  it("reuses the session's grant while it will outlast the trip to the server", () => {
    expect(usableRealtimeGrant(realtime, expiresAt - 30_000)).toBe("grant");
  });

  it("asks for a new grant once the held one is about to lapse", () => {
    expect(usableRealtimeGrant(realtime, expiresAt - 5_000)).toBeNull();
    expect(usableRealtimeGrant(realtime, expiresAt + 1)).toBeNull();
    expect(usableRealtimeGrant(null, expiresAt - 30_000)).toBeNull();
  });
});

describe("holdsInvalidatedState", () => {
  it("skips an invalidation for state the session already holds", () => {
    expect(holdsInvalidatedState(session(5), invalidation({ stateSequence: 5 }))).toBe(true);
    expect(holdsInvalidatedState(session(5), invalidation({ stateSequence: 6 }))).toBe(false);
  });

  it("reads again when the invalidation or the session gives no sequence to compare", () => {
    expect(holdsInvalidatedState(session(5), invalidation(null))).toBe(false);
    expect(
      holdsInvalidatedState({ ...session(5), run: null }, invalidation({ stateSequence: 1 })),
    ).toBe(false);
    expect(holdsInvalidatedState(null, invalidation({ stateSequence: 1 }))).toBe(false);
  });
});

/** `Promise.withResolvers`, which this package's ES2023 lib does not declare. */
function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("coalesced", () => {
  it("collapses calls during a run into one more run", async () => {
    const releases: Array<() => void> = [];
    let started = deferred();
    const refresh = coalesced(async () => {
      const gate = deferred();
      releases.push(gate.resolve);
      started.resolve();
      await gate.promise;
    });

    refresh();
    refresh();
    refresh();
    expect(releases).toHaveLength(1);

    started = deferred();
    releases[0]?.();
    await started.promise;
    expect(releases).toHaveLength(2);

    refresh();
    refresh();
    started = deferred();
    releases[1]?.();
    await started.promise;
    expect(releases).toHaveLength(3);
    releases[2]?.();
  });
});
