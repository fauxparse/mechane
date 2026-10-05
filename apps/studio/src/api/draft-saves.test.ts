import type { ShowId } from "@mechane/domain/id";
import { describe, expect, it } from "vitest";

import { draftSavesSettled, trackDraftSave } from "./draft-saves";

/** `Promise.withResolvers`, which this package's lib does not declare. */
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("draftSavesSettled", () => {
  it("waits for a save sent while it was waiting, and survives a failed save", async () => {
    const showId = "stwaits1" as ShowId;
    const first = deferred();
    trackDraftSave(showId, first.promise);
    let settled = false;
    const read = draftSavesSettled(showId).then(() => {
      settled = true;
    });

    const chained = deferred();
    trackDraftSave(showId, chained.promise);
    first.reject(new Error("conflict"));
    // Microtasks only: ample turns for a read that stopped at the first save to settle.
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
    expect(settled).toBe(false);

    chained.resolve();
    await expect(read).resolves.toBeUndefined();
  });

  it("does not hold up another Show's reads", async () => {
    trackDraftSave("stother1" as ShowId, deferred().promise);
    await expect(draftSavesSettled("stfree01" as ShowId)).resolves.toBeUndefined();
  });
});
