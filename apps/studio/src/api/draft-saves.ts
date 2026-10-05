import type { ShowId } from "@mechane/domain/id";

/**
 * Draft saves still on the wire, per Show.
 *
 * Leaving an editor sends its pending edits as it unmounts, and the next editor reads the draft as
 * it mounts, so the read and the write race. A read that wins opens without the edits — a Scene
 * created and immediately opened in the Canvas would be missing from it. Draft reads wait here
 * until every save sent before them has settled.
 */
const inFlight = new Map<ShowId, Set<Promise<unknown>>>();

export function trackDraftSave(showId: ShowId, save: Promise<unknown>): void {
  const saves = inFlight.get(showId) ?? new Set<Promise<unknown>>();
  inFlight.set(showId, saves);
  saves.add(save);
  const settle = () => {
    saves.delete(save);
    if (saves.size === 0 && inFlight.get(showId) === saves) inFlight.delete(showId);
  };
  save.then(settle, settle);
}

/** Resolves once no save of the Show's draft is in flight, including saves chained meanwhile. */
export async function draftSavesSettled(showId: ShowId): Promise<void> {
  for (let saves = inFlight.get(showId); saves; saves = inFlight.get(showId)) {
    await Promise.allSettled(saves);
  }
}
