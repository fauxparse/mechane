// Insert-time collision handling for the short ids in @presence/domain's
// `id` module (issue #47). Ids are 7 random characters, so a collision is
// vanishingly unlikely — but "vanishingly unlikely" over a long enough
// life is a user-facing 500, and the fix is small enough that there's no
// reason to leave it to chance.
//
// The database's primary-key constraint is what actually detects the
// collision; this just retries against it. Checking for the id with a
// SELECT first would be a race, not a fix.
import type { EntityName, Id } from "@presence/domain";
import { generateId } from "@presence/domain";

/** Postgres `unique_violation`. */
const UNIQUE_VIOLATION = "23505";

const MAX_ATTEMPTS = 3;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

/**
 * Calls `insert` with a freshly generated id, retrying with a new id if the
 * database rejects it as a duplicate. Any other error propagates untouched
 * — a unique violation on some *other* column (a duplicate email, say) is
 * a real error and retrying it would just fail three times slower.
 */
export async function withUniqueId<E extends EntityName, T>(
  entity: E,
  insert: (id: Id<E>) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await insert(generateId(entity));
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
